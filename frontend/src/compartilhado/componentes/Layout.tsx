// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState, useRef } from 'react';
import { NavLink, Outlet, useParams, Link, useLocation } from 'react-router-dom';
import {
  Bell, Calendar, BookOpenCheck, Vote, Landmark,
  FileText, Building2, Award, BarChart3, MessageSquare,
  Bug, Menu, ChevronLeft, ChevronRight, LogOut, UserPlus, Fingerprint, Home, X, Download
} from 'lucide-react';
import { useAuth, clienteHttp } from '../contextos/AuthContext';
import { usePwaInstall } from '../hooks/usePwaInstall';
import LogoAnimadaCore from './LogoAnimadaCore';
import ModalReportarBug from './ModalReportarBug';

export default function Layout() {
  const { podeInstalar, dispararInstalacao } = usePwaInstall();
  const { id } = useParams();
  const location = useLocation();
  const { usuario, logout } = useAuth();
  const [regiaoNome, setRegiaoNome] = useState('Carregando...');
  
  
  // Menu colapsável: suporta fixação via botão sandwich e expansão automática on hover
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = sidebarPinned || isHovered;
  const [showBugModal, setShowBugModal] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  // Tooltip flutuante com posição fixa (escapa de overflow-y-auto e overflow-hidden)
  const [tooltipData, setTooltipData] = useState<{
    id: string;
    titulo: string;
    descricao: string;
    top: number;
    left: number;
  } | null>(null);

  const hoverTimerRef = useRef<any>(null);
  const pendingTargetRef = useRef<string | null>(null);
  const targetElementRef = useRef<HTMLElement | null>(null);

  const handleMouseEnterItem = (item: { id: string; titulo: string; descricao: string }, e: React.MouseEvent<HTMLElement>) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    pendingTargetRef.current = item.id;
    targetElementRef.current = e.currentTarget;

    hoverTimerRef.current = setTimeout(() => {
      if (pendingTargetRef.current === item.id && targetElementRef.current) {
        const freshRect = targetElementRef.current.getBoundingClientRect();
        setTooltipData({
          id: item.id,
          titulo: item.titulo,
          descricao: item.descricao,
          top: freshRect.top + freshRect.height / 2,
          left: freshRect.right + 12
        });
      }
    }, 2000);
  };

  const handleMouseLeaveItem = () => {
    pendingTargetRef.current = null;
    targetElementRef.current = null;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setTooltipData(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const fetchRegiao = async () => {
      try {
        const res = await clienteHttp.get(`/regioes/${id}`);
        setRegiaoNome(res.data.nome);
      } catch (err) {
        setRegiaoNome('Conselho Regional de Veneráveis Mestres de Anápolis e Região');
      } finally {
        
      }
    };
    if (id) fetchRegiao();
  }, [id]);

  // ALTERAÇÃO (2026-09-18, a pedido do usuário -- "para os veneráveis a
  // configuração da própria loja não ficou em lugar trivial, podemos criar
  // um botão exclusivo?"): descobre se a pessoa logada é Venerável Mestre de
  // alguma Loja desta Região (mesmo campo `loja_id` já usado em
  // PaginaLojas.tsx, vindo de GET /regional/{id}/me) só para decidir se o
  // item de menu "Minha Loja" aparece. Falha silenciosa (ex.: usuário é só
  // Diretoria, sem Loja própria) -- o item de menu simplesmente não aparece.
  const [minhaLojaId, setMinhaLojaId] = useState<string | null>(null);
  // ALTERAÇÃO (2026-09-19): também guarda o `role` inteiro (não só o
  // `loja_id`) — necessário para o menu reduzido do Secretário/Chanceler
  // (Operador Administrativo) abaixo, que não deve ver os módulos cujas
  // rotas ainda exigem o perfil "cheio" (Diretoria/Suplente/VM). Ver
  // claude/roteiro-testes-manuais.md, item B.10, no Project "Core".
  const [meuRole, setMeuRole] = useState<string | null>(null);
  
  const isSuperAdmin = usuario?.roles?.includes('super_admin') || usuario?.roles?.includes('superadmin') || usuario?.roles?.includes('sistema');

  useEffect(() => {
    const fetchMeuContexto = async () => {
      try {
        const res = await clienteHttp.get(`/regional/${id}/me`);
        setMinhaLojaId(res.data?.loja_id || null);
        setMeuRole(res.data?.role || null);
      } catch (err) {
        setMinhaLojaId(null);
        setMeuRole(null);
      }
    };
    if (id) fetchMeuContexto();
  }, [id]);

  // ALTERAÇÃO (2026-09-19): Secretário/Chanceler (Operador Administrativo)
  // é um perfil "só a própria Loja" — as rotas de Diretoria, Lojas
  // Jurisdicionadas (tabela completa), Votações, Patrimônio e Relatórios
  // continuam exclusivas de Diretoria/Suplente/VM/SuperAdmin
  // (`get_current_regional_user` estrito) e dariam 403 para este perfil.
  // Os módulos abaixo já foram confirmados como compatíveis (ver
  // core/dependencies.py: `obter_identidade_regional_ou_operador_
  // administrativo`, usado por Avisos, Agenda, Admissões, Documentos e
  // Comunicação).
  const souOperadorAdministrativo = meuRole === 'OPERADOR_ADMINISTRATIVO';

  // Lista dos 10 módulos solicitados (sem numeração)
  const itensMenuCompleto = [
    {
      id: 'avisos',
      titulo: 'Avisos e Notificações',
      to: `/regiao/${id}`,
      exact: true,
      icone: Bell,
      descricao: 'Comunicados, novidades e alertas'
    },
    // ALTERAÇÃO (2026-09-18, a pedido do usuário): atalho exclusivo para o
    // Venerável Mestre -- leva direto para a própria Loja dentro de "Lojas
    // Jurisdicionadas" (filtro "Minha Loja" pré-selecionado via ?minha=1),
    // sem precisar buscar a linha entre todas as lojas da Região. Só
    // aparece para quem é VM de alguma Loja (minhaLojaId preenchido).
    ...(minhaLojaId ? [{
      id: 'minha-loja',
      titulo: 'Minha Loja',
      to: `/regiao/${id}/lojas?minha=1`,
      icone: Home,
      descricao: 'Acesso direto aos dados, oficiais e Suplente da sua própria Loja'
    }] : []),
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
      descricao: 'Propostas de Iniciação, Filiação ou Regularização'
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
    },
    {
      // Adicionado em 2026-09-17. Nao fica sob /regiao/${id} porque a
      // Solicitacao de Cadastro e' um conceito do e-Sigma (Loja), nao da
      // Regiao do Core -- por isso o "to" e' um caminho absoluto fixo,
      // nao interpolado com o id da regiao atual. O proprio backend do
      // e-Sigma decide quem ve/decide o que; quem nao for elegivel para
      // nenhuma Loja simplesmente ve a lista vazia nesta tela.
      id: 'solicitacoes-cadastro',
      titulo: 'Solicitações de Cadastro',
      to: '/solicitacoes-cadastro',
      icone: UserPlus,
      descricao: 'Aprovar ou rejeitar pedidos de acesso de novos membros'
    },
    {
      // Adicionado em 2026-09-18, junto com o backend de passkeys. Mesma
      // razão de caminho absoluto do item acima: gerenciar as PRÓPRIAS
      // passkeys é um conceito de Pessoa (e-Sigma), não de Região.
      id: 'minhas-passkeys',
      titulo: 'Minhas Passkeys',
      to: '/minhas-passkeys',
      icone: Fingerprint,
      descricao: 'Entrar sem senha usando biometria ou PIN do dispositivo'
    }
  ];

  // ALTERAÇÃO (2026-09-19): para Secretário/Chanceler, restringe o menu aos
  // módulos cujas rotas já aceitam Operador Administrativo — os demais
  // ('diretoria', 'lojas' completa, 'votacoes', 'patrimonio', 'relatorios',
  // 'solicitacoes-cadastro', que é escopo de Diretoria/SuperAdmin do
  // e-Sigma) ficariam com telas quebradas (403) para este perfil.
  const IDS_MODULOS_OPERADOR_ADMINISTRATIVO = [
    'avisos', 'minha-loja', 'agenda', 'admissao', 'documentos', 'comunicacao', 'minhas-passkeys'
  ];
  const itensMenu = souOperadorAdministrativo
    ? itensMenuCompleto.filter(item => IDS_MODULOS_OPERADOR_ADMINISTRATIVO.includes(item.id))
    : itensMenuCompleto;

  return (
    <div className="flex flex-col h-screen bg-sigma-bg text-gray-200 overflow-hidden font-sans">
      
      {/* HEADER FULL-WIDTH (Deep Blue Glass) */}
      <header className="w-full h-16 bg-[#070e1c] border-b border-[rgba(221,185,107,0.2)] px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none">
          
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen(prev => !prev);
                } else {
                  setSidebarPinned(!sidebarPinned);
                }
              }}
              className="text-[#DDB96B] hover:text-[#FDE68A] transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
  
            <Link to={id ? `/regiao/${id}` : '/'} className="flex items-center shrink-0">
              <LogoAnimadaCore theme="ouro" width={34} height={30} animated={false} />
            </Link>
  
            <div className="flex flex-col justify-center leading-tight ml-1">
              <span className="text-[12px] font-black text-white uppercase tracking-wide">Conselho Regional</span>
              <span className="text-[14px] font-black text-white">Anápolis</span>
            </div>
          </div>
  
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                to="/superadmin"
                className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-500 hover:bg-blue-600/30 transition-all"
                title="Painel Geral"
              >
                <Home className="w-5 h-5" />
              </Link>
            )}
            
            <div className="w-10 h-10 rounded-full bg-sigma-gold text-[#070F1E] flex items-center justify-center font-black text-lg shadow-md cursor-default">
              {usuario?.nome ? usuario.nome.charAt(0).toUpperCase() : 'S'}
            </div>
            
            <button
              type="button"
              onClick={logout}
              className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-500 hover:bg-blue-600/30 transition-all"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

      {/* ÁREA INFERIOR: SIDEBAR COLAPSÁVEL + CONTEÚDO PRINCIPAL */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR COLAPSÁVEL COM EXPANSÃO AUTOMÁTICA ON HOVER */}
        <aside 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`hidden md:flex transition-all duration-300 ease-in-out bg-[#070e1c]/95 backdrop-blur-md border-r border-[rgba(221,185,107,0.2)] flex-col justify-between shrink-0 select-none z-20 ${
            isExpanded ? 'w-72 shadow-2xl' : 'w-20'
          }`}
        >
          {/* Navegação dos 10 Módulos */}
          <div 
            onScroll={handleMouseLeaveItem}
            className="flex-1 overflow-y-auto py-3 px-2 space-y-1.5 scrollbar-thin scrollbar-thumb-[#162744]"
          >
            
            {/* Header interno do menu com botão recolher/expandir */}
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-[rgba(221,185,107,0.15)]">
              {isExpanded ? (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#FDE68A] truncate max-w-[180px]" title={regiaoNome || "Conselho Regional"}>
                    {regiaoNome || "Conselho Regional"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSidebarPinned(false);
                      setIsHovered(false);
                    }}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-[#0e1c36] transition-colors"
                    title="Recolher para modo ícones"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarPinned(true)}
                  className="w-full flex justify-center py-1 text-gray-400 hover:text-[#FDE68A] transition-colors"
                  title="Fixar Menu Expandido"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Itens do Menu */}
            {itensMenu.map((item) => {
              const Icone = item.icone;
              const [itemPath, itemQuery] = item.to.split('?');
              // CORREÇÃO (2026-09-18, reportado pelo usuário): "Minha Loja"
              // e "Lojas Jurisdicionadas" apontam pro mesmo caminho
              // (/regiao/{id}/lojas), diferindo só pela query "?minha=1" --
              // sem este ajuste, os dois ficavam destacados juntos sempre
              // que "Minha Loja" estava ativo, porque o item sem query
              // (Lojas Jurisdicionadas) só checava o prefixo do caminho,
              // sem excluir a query "especial" de outro item que aponta pro
              // mesmo lugar.
              const outroItemComQueryMesmoCaminho = itensMenu.find(
                (outro) => outro !== item && outro.to.includes('?') && outro.to.split('?')[0] === itemPath
              );
              const isActive = item.exact
                ? location.pathname === itemPath
                : itemQuery
                  ? location.pathname.startsWith(itemPath) && location.search.includes(itemQuery)
                  : location.pathname.startsWith(itemPath) && !(
                      outroItemComQueryMesmoCaminho
                      && location.search.includes(outroItemComQueryMesmoCaminho.to.split('?')[1])
                    );

              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  onMouseEnter={(e) => handleMouseEnterItem(item, e)}
                  onMouseLeave={handleMouseLeaveItem}
                  className={`group relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-[rgba(221,185,107,0.14)] text-[#FDE68A] border border-[rgba(221,185,107,0.35)] shadow-sm font-semibold' 
                      : 'text-gray-300 hover:text-white hover:bg-[rgba(14,28,54,0.6)] border border-transparent'
                  } ${!isExpanded ? 'justify-center' : ''}`}
                >
                  {/* Ícone */}
                  <div className={`shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-[#FDE68A]' : 'text-gray-400 group-hover:text-white'}`}>
                    <Icone className="w-5 h-5" />
                  </div>

                  {/* Texto Expandido (Apenas o título limpo) */}
                  {isExpanded && (
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">
                        {item.titulo}
                      </p>
                    </div>
                  )}
                </NavLink>
              );
            })}

            {/* Divisor */}
            <div className="pt-2 pb-1 border-t border-[rgba(221,185,107,0.15)] my-1"></div>

            {/* Item Especial: Reportar Bug no Sistema */}
            <button
              type="button"
              onClick={() => setShowBugModal(true)}
              onMouseEnter={(e) => handleMouseEnterItem({ id: 'bug', titulo: 'Reportar Bug / Falha', descricao: 'Canal direto com o SuperAdmin e equipe técnica' }, e)}
              onMouseLeave={handleMouseLeaveItem}
              className={`w-full group relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all text-amber-400/90 hover:text-amber-300 hover:bg-[rgba(14,28,54,0.6)] border border-transparent hover:border-[rgba(221,185,107,0.3)] cursor-pointer ${
                !isExpanded ? 'justify-center' : ''
              }`}
            >
              <Bug className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              {isExpanded && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-bold truncate">Reportar Bug</p>
                </div>
              )}
            </button>

          </div>

          {/* RODAPÉ DO MENU PRINCIPAL: ADDEX SOLUTIONS */}
          <div className="p-3 border-t border-[rgba(221,185,107,0.15)] bg-[#070e1c]/80 text-center select-none">
            {isExpanded ? (
              <div className="space-y-0.5 animate-in fade-in duration-300">
                <p className="text-[10px] font-bold text-gray-300 tracking-wide">
                  Desenvolvido por <span className="text-[#FDE68A]">Addex Solutions</span>
                </p>
                <p className="text-[9px] text-gray-400">Copyright 2026</p>
                <a 
                  href="mailto:andreluiz@addex.dev" 
                  className="text-[9px] text-[#DDB96B] hover:text-[#FDE68A] hover:underline block truncate font-mono pt-0.5"
                >
                  Contato: andreluiz@addex.dev
                </a>
              </div>
            ) : (
              <div 
                className="flex flex-col items-center justify-center text-center cursor-help py-1" 
                title="Desenvolvido por Addex Solutions - Copyright 2026 Contato: andreluiz@addex.dev"
              >
                <span className="text-[9px] font-black tracking-wider text-[#FDE68A]">ADDEX</span>
                <span className="text-[8px] text-gray-400 font-mono">2026</span>
              </div>
            )}
          </div>

        </aside>

        {/* MOBILE DRAWER BACKDROP */}
        {mobileDrawerOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-sigma-bg/75 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        {/* MOBILE DRAWER ASIDE */}
        <aside 
          className={`md:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#070e1c] border-r border-[rgba(221,185,107,0.3)] z-50 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between p-4 border-b border-[rgba(221,185,107,0.2)]">
            <div className="flex items-center gap-2.5">
              <LogoAnimadaCore theme="ouro" width={28} height={25} animated={false} />
              <span className="text-xs font-bold text-[#FDE68A] uppercase tracking-wider truncate max-w-[170px]" title={regiaoNome || "Conselho Regional"}>
                {regiaoNome || "Conselho Regional"}
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#0e1c36]"
              title="Fechar Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lista de Módulos no Mobile Drawer */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-[#162744]">
            {itensMenu.map((item) => {
              const Icone = item.icone;
              const [itemPath, itemQuery] = item.to.split('?');
              const outroItemComQueryMesmoCaminho = itensMenu.find(
                (outro) => outro !== item && outro.to.includes('?') && outro.to.split('?')[0] === itemPath
              );
              const isActive = item.exact
                ? location.pathname === itemPath
                : itemQuery
                  ? location.pathname.startsWith(itemPath) && location.search.includes(itemQuery)
                  : location.pathname.startsWith(itemPath) && !(
                      outroItemComQueryMesmoCaminho
                      && location.search.includes(outroItemComQueryMesmoCaminho.to.split('?')[1])
                    );

              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  onClick={() => setMobileDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl min-h-[48px] transition-colors ${
                    isActive 
                      ? 'bg-[rgba(221,185,107,0.18)] text-[#FDE68A] font-semibold border border-[rgba(221,185,107,0.4)]'
                      : 'text-gray-300 hover:text-white hover:bg-[rgba(14,28,54,0.6)]'
                  }`}
                >
                  <Icone className="w-5 h-5 shrink-0 text-[#DDB96B]" />
                  <span className="text-sm">{item.titulo}</span>
                </NavLink>
              );
            })}

            <div className="pt-2 border-t border-[rgba(221,185,107,0.15)] my-2"></div>

            {podeInstalar && (
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  dispararInstalacao();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl min-h-[48px] bg-gradient-to-r from-amber-500/20 to-yellow-600/20 border border-[#DDB96B]/50 text-[#FDE68A] hover:bg-sigma-elevated border border-sigma-border transition-all font-semibold shadow-lg mb-2"
              >
                <Download className="w-5 h-5 shrink-0 animate-bounce" />
                <span className="text-sm">Instalar Aplicativo</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMobileDrawerOpen(false);
                setShowBugModal(true);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl min-h-[48px] text-amber-400 hover:bg-[rgba(14,28,54,0.6)] transition-colors"
            >
              <Bug className="w-5 h-5 shrink-0" />
              <span className="text-sm font-bold">Reportar Bug</span>
            </button>
          </div>

          <div className="p-3 border-t border-[rgba(221,185,107,0.15)] bg-[#070e1c]/90 text-center">
            <p className="text-[10px] font-bold text-gray-300">Addex Solutions • 2026</p>
          </div>
        </aside>

        {/* ÁREA CENTRAL DE CONTEÚDO */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-sigma-bg">
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>

          {/* BARRA INFERIOR MOBILE (THUMB ZONE) */}
          <nav className="md:hidden sticky bottom-0 left-0 right-0 h-16 pb-safe bg-[#070e1c]/95 backdrop-blur-md border-t border-[rgba(221,185,107,0.25)] flex items-center justify-around px-1 z-30 shrink-0 shadow-lg">
            <NavLink
              to={`/regiao/${id}`}
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors ${
                  isActive ? 'text-[#FDE68A] font-bold' : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <Bell className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Avisos</span>
            </NavLink>

            <NavLink
              to={`/regiao/${id}/lojas`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors ${
                  isActive ? 'text-[#FDE68A] font-bold' : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <Building2 className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Lojas</span>
            </NavLink>

            <NavLink
              to={`/regiao/${id}/admissoes`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors ${
                  isActive ? 'text-[#FDE68A] font-bold' : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <BookOpenCheck className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Prévias</span>
            </NavLink>

            <NavLink
              to={`/regiao/${id}/votacoes`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors ${
                  isActive ? 'text-[#FDE68A] font-bold' : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <Vote className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Votações</span>
            </NavLink>

            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-gray-400 hover:text-[#FDE68A] transition-colors"
            >
              <Menu className="w-5 h-5 mb-0.5" />
              <span className="text-[10px]">Mais</span>
            </button>
          </nav>
        </main>

      </div>

      {/* Modal de Reportar Bug */}
      <ModalReportarBug 
        isOpen={showBugModal}
        onClose={() => setShowBugModal(false)}
        usuarioAtual={usuario}
      />

      {/* Tooltip flutuante refinado com fundo escuro e efeito de vidro translúcido (Fixed z-[9999]) */}
      {tooltipData && (
        <div 
          style={{ 
            top: `${tooltipData.top}px`, 
            left: `${tooltipData.left}px` 
          }}
          className="fixed -translate-y-1/2 px-4 py-2.5 bg-sigma-surface/95 backdrop-blur-xl text-white rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.95)] border border-sigma-border z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-200 min-w-[200px] max-w-[320px]"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sigma-gold text-[#070F1E] shadow-md animate-pulse"></span>
            <p className="font-bold text-[#facc15] text-xs tracking-wide">
              {tooltipData.titulo}
            </p>
          </div>
          <p className="text-[11px] text-gray-300 font-normal leading-relaxed">
            {tooltipData.descricao}
          </p>
        </div>
      )}

        

    </div>
  );
}

