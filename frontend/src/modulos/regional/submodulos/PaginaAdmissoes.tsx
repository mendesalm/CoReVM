import React, { useState, useEffect } from 'react';
import { clienteHttp, API_URL } from '../../../compartilhado/contextos/AuthContext';
import { CampoData } from '../../../compartilhado/componentes/SeletorDataHora';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpenCheck, ShieldCheck, Loader2, Award,
  Plus, Search, ArrowLeft, FileText, Download, 
  MessageSquare,  Trash2, Send, CheckCircle2,
  Clock, Sparkles, User, X, Eye, CheckCheck, RotateCcw, Pin,  
   ChevronLeft, ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react';

// CORREÇÃO (2026-09-18): esta página ainda usava axios puro + um seletor
// "Simular Acesso" que enviava um header `X-User-Id` não autenticado —
// mecanismo de teste anterior ao fix de segurança do e-Sigma (2026-09-11,
// ver core/auth_esigma.py). Desde então, `/regional/{id}/me`, `/lojas` e
// `/admissoes` exigem `Authorization: Bearer` real (validado via
// get_current_regional_user / obter_identidade_regional_ou_operador_administrativo),
// então o header X-User-Id nunca mais foi aceito: toda chamada desta página
// vinha retornando 422 (FastAPI reclamando do header `Authorization`
// obrigatório e ausente) sem que ninguém notasse, até o simulador de acesso
// mascarar o problema com a mensagem de erro que ele mesmo tentava mostrar
// (ver bug abaixo). Substituído por `clienteHttp` (injeta o token real do
// login via AuthContext, mesmo padrão já usado em PaginaLojas.tsx), e o
// contexto de usuário passou a vir inteiramente da resposta de
// `/regional/{id}/me`.
//
// CORREÇÃO (2026-09-18, bug de renderização): o `detail` de um erro 422 do
// FastAPI vem como uma LISTA de objetos ({type, loc, msg, input}), não uma
// string — `setErro(err.response?.data?.detail || ...)` estava jogando essa
// lista direto no estado e, ao renderizar `{erro}` como filho de um <p>,
// quebrava a página inteira ("Objects are not valid as a React child").
// Esta função normaliza qualquer formato de erro do backend (string simples,
// lista de erros de validação, ou erro de rede) para uma string segura de
// exibir — mesmo padrão já usado em PaginaLojas.tsx.
function extrairMensagemErro(err: any, mensagemPadrao: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const mensagens = detail
      .map((d: any) => (typeof d === 'string' ? d : d?.msg))
      .filter(Boolean);
    if (mensagens.length > 0) return mensagens.join('; ');
  }
  return mensagemPadrao;
}

interface PreviaAdmissaoItem {
  id: string;
  regiao_id: string;
  tipo: string;
  tipo_label: string;
  titulo_formatado: string;
  loja_id: string;
  loja_nome: string;
  loja_numero: string;
  candidato_nome: string;
  pdf_url: string;
  pdf_nome_original: string;
  data_postagem: string;
  data_limite: string | null;
  status: string; // 'EM_ANDAMENTO' | 'AVERIGUADO' | 'CONCLUIDO'
  verificado_por_nome?: string | null;
  data_verificacao?: string | null;
  autor_id: string;
  autor_nome: string;
  total_consideracoes: number;
  pode_editar: boolean;
  pode_considerar: boolean;
}

interface ConsideracaoItem {
  id: string;
  previa_id: string;
  autor_id: string;
  autor_nome: string;
  autor_cargo: string;
  loja_id: string;
  loja_nome: string;
  loja_numero?: string;
  conteudo: string;
  data_criacao: string;
  pode_excluir: boolean;
}

export default function PaginaAdmissoes() {
  const { id } = useParams<{ id: string }>();
  const [previas, setPrevias] = useState<PreviaAdmissaoItem[]>([]);
  const [lojasConselho, setLojasConselho] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  
  // Controle de Usuário e RBAC (resolvido inteiramente por GET /me, a
  // partir do token real de login — ver correção de 2026-09-18 acima)
  const [userContext, setUserContext] = useState<any>({
    usuario_id: '',
    role: '',
    is_diretoria: false,
    loja_id: null
  });

  // Filtros, Busca, Ordenação e Paginação
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'INICIACAO' | 'FILIACAO' | 'REGULARIZACAO'>('INICIACAO');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'EM_ANDAMENTO' | 'AVERIGUADO'>(
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'EM_ANDAMENTO' : 'TODOS'
  );
  const [ordenacao, ] = useState<'RECENTES' | 'PRAZO' | 'PARECERES' | 'PENDENTES_PRIMEIRO'>('RECENTES');
  const [itensPorPagina, ] = useState(6);

  // Modal de Considerações
  const [previaSelecionada, setPreviaSelecionada] = useState<PreviaAdmissaoItem | null>(null);
  const [pareceresAbertos, setPareceresAbertos] = useState(false);
  const [consideracoes, setConsideracoes] = useState<ConsideracaoItem[]>([]);
  const [carregandoConsideracoes, setCarregandoConsideracoes] = useState(false);
  const [novaConsideracaoTexto, setNovaConsideracaoTexto] = useState('');
  const [enviandoConsideracao, setEnviandoConsideracao] = useState(false);

  // Modal de Nova Prévia
  const [showNovaPreviaModal, setShowNovaPreviaModal] = useState(false);
  const [salvandoPrevia, setSalvandoPrevia] = useState(false);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [formPrevia, setFormPrevia] = useState({
    tipo: 'INICIACAO',
    loja_id: '',
    loja_nome: '',
    loja_numero: '',
    candidato_nome: '',
    data_limite: ''
  });

  // Modal de Preview do PDF
  const [pdfPreviewModal, setPdfPreviewModal] = useState<string | null>(null);

  // Carregar dados
  const carregarDados = async () => {
    setLoading(true);
    setErro('');

    try {
      // 1. Prévias de Admissão
      try {
        const previasRes = await clienteHttp.get(`${API_URL}/regional/${id}/admissoes`);
        setPrevias(previasRes.data || []);
      } catch (errPrevias: any) {
        console.error('Erro ao buscar prévias:', errPrevias);
        setErro(extrairMensagemErro(errPrevias, 'Não foi possível carregar os pedidos de admissão do conselho.'));
      }

      // 2. Contexto do Usuário (RBAC)
      try {
        const userRes = await clienteHttp.get(`${API_URL}/regional/${id}/me`);
        if (userRes.data) setUserContext(userRes.data);
      } catch (errUser) {
        console.warn('Contexto do usuário não pôde ser carregado:', errUser);
      }

      // 3. Lojas do Conselho (para o select de nova prévia)
      try {
        const lojasRes = await clienteHttp.get(`${API_URL}/regional/${id}/lojas`);
        const lojasList = lojasRes.data?.lojas || [];
        setLojasConselho(lojasList);

        if (lojasList.length > 0 && !formPrevia.loja_id) {
          setFormPrevia(prev => ({
            ...prev,
            loja_id: lojasList[0].id.toString(),
            loja_nome: lojasList[0].nome,
            loja_numero: lojasList[0].numero || 'S/N'
          }));
        }
      } catch (errLojas) {
        console.warn('Lista de lojas não pôde ser carregada:', errLojas);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) carregarDados();
  }, [id]);

  // Alternar Status de Verificação (Marcar como Averiguado / Em Aberto)
  const handleAlternarStatus = async (previaId: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'AVERIGUADO' ? 'EM_ANDAMENTO' : 'AVERIGUADO';
    try {
      const res = await clienteHttp.put(
        `${API_URL}/regional/${id}/admissoes/${previaId}/status`,
        { status: novoStatus }
      );
      
      setPrevias(prev => prev.map(p => {
        if (p.id === previaId) {
          return {
            ...p,
            status: res.data.novo_status,
            verificado_por_nome: res.data.verificado_por_nome,
            data_verificacao: res.data.data_verificacao
          };
        }
        return p;
      }));

      if (previaSelecionada?.id === previaId) {
        setPreviaSelecionada(prev => prev ? {
          ...prev,
          status: res.data.novo_status,
          verificado_por_nome: res.data.verificado_por_nome,
          data_verificacao: res.data.data_verificacao
        } : null);
      }
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao atualizar verificação'));
    }
  };

  // Abrir Modal de Considerações
  const abrirModalConsideracoes = async (previa: PreviaAdmissaoItem) => {
    setPreviaSelecionada(previa);
    setPareceresAbertos(false);
    setCarregandoConsideracoes(true);
    setNovaConsideracaoTexto('');
    try {
      const res = await clienteHttp.get(`${API_URL}/regional/${id}/admissoes/${previa.id}/consideracoes`);
      setConsideracoes(res.data || []);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao carregar pareceres da prévia'));
    } finally {
      setCarregandoConsideracoes(false);
    }
  };

  // Enviar Nova Consideração
  const handleEnviarConsideracao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previaSelecionada || !novaConsideracaoTexto.trim()) return;

    setEnviandoConsideracao(true);
    try {
      let nomeAutor = '';
      if (userContext.is_diretoria) {
        nomeAutor = `Mesa Diretora (${userContext.role})`;
      } else if (userContext.loja_id) {
        nomeAutor = `Venerável Mestre (Loja ${userContext.loja_id})`;
      } else {
        nomeAutor = `Ir. ${userContext.usuario_id}`;
      }

      await clienteHttp.post(
        `${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes`,
        {
          conteudo: novaConsideracaoTexto.trim(),
          autor_nome: nomeAutor,
          autor_cargo: userContext.role || 'Venerável Mestre'
        }
      );

      const res = await clienteHttp.get(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes`);
      setConsideracoes(res.data || []);
      setNovaConsideracaoTexto('');

      setPrevias(prev => prev.map(p => p.id === previaSelecionada.id ? { ...p, total_consideracoes: res.data.length } : p));
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao registrar consideração'));
    } finally {
      setEnviandoConsideracao(false);
    }
  };

  // Excluir Consideração
  const handleExcluirConsideracao = async (consId: string) => {
    if (!previaSelecionada || !confirm('Deseja realmente ocultar este parecer?')) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes/${consId}`);
      setConsideracoes(prev => prev.filter(c => c.id !== consId));
      setPrevias(prev => prev.map(p => p.id === previaSelecionada.id ? { ...p, total_consideracoes: Math.max(0, p.total_consideracoes - 1) } : p));
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao excluir consideração'));
    }
  };

  // Excluir Prévia (Deleção Visual)
  // @ts-ignore
    const handleExcluirPrevia = async (previaId: string) => {
    if (!confirm('Deseja realmente ocultar esta prévia do Mural de Admissão?')) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/admissoes/${previaId}`);
      setPrevias(prev => prev.filter(p => p.id !== previaId));
      if (previaSelecionada?.id === previaId) {
        setPreviaSelecionada(null);
      }
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao remover prévia'));
    }
  };

  // Submeter Nova Prévia
  const handleSalvarNovaPrevia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPrevia.candidato_nome.trim()) {
      alert('Informe o nome do candidato.');
      return;
    }

    setSalvandoPrevia(true);
    try {
      if (arquivoPdf) {
        const formData = new FormData();
        formData.append('tipo', formPrevia.tipo);
        formData.append('loja_id', formPrevia.loja_id);
        formData.append('loja_nome', formPrevia.loja_nome);
        formData.append('loja_numero', formPrevia.loja_numero);
        formData.append('candidato_nome', formPrevia.candidato_nome.trim());
        if (formPrevia.data_limite) formData.append('data_limite', formPrevia.data_limite);
        formData.append('arquivo', arquivoPdf);

        await clienteHttp.post(`${API_URL}/regional/${id}/admissoes/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await clienteHttp.post(`${API_URL}/regional/${id}/admissoes`, {
          tipo: formPrevia.tipo,
          loja_id: formPrevia.loja_id,
          loja_nome: formPrevia.loja_nome,
          loja_numero: formPrevia.loja_numero,
          candidato_nome: formPrevia.candidato_nome.trim(),
          data_limite: formPrevia.data_limite || null
        });
      }

      setShowNovaPreviaModal(false);
      setArquivoPdf(null);
      setFormPrevia(prev => ({ ...prev, candidato_nome: '', data_limite: '' }));
      carregarDados();
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao publicar prévia'));
    } finally {
      setSalvandoPrevia(false);
    }
  };

  // 1. Filtragem
  const previasFiltradas = previas.filter(p => {
    const atendeFiltroTipo = p.tipo.toUpperCase() === filtroTipo;
    const atendeFiltroStatus = 
      filtroStatus === 'TODOS' || 
      (filtroStatus === 'AVERIGUADO' && p.status === 'AVERIGUADO') ||
      (filtroStatus === 'EM_ANDAMENTO' && p.status !== 'AVERIGUADO');
    const termo = busca.toLowerCase();
    const atendeBusca = 
      p.candidato_nome.toLowerCase().includes(termo) ||
      p.loja_nome.toLowerCase().includes(termo) ||
      p.loja_numero.toLowerCase().includes(termo) ||
      p.titulo_formatado.toLowerCase().includes(termo);
    return atendeFiltroTipo && atendeFiltroStatus && atendeBusca;
  });

  // 2. Ordenação
  const previasOrdenadas = [...previasFiltradas].sort((a, b) => {
    if (ordenacao === 'PRAZO') {
      const dataA = a.data_limite || '9999-12-31';
      const dataB = b.data_limite || '9999-12-31';
      return dataA.localeCompare(dataB);
    }
    if (ordenacao === 'PARECERES') {
      return b.total_consideracoes - a.total_consideracoes;
    }
    if (ordenacao === 'PENDENTES_PRIMEIRO') {
      if (a.status !== b.status) {
        return a.status === 'EM_ANDAMENTO' ? -1 : 1;
      }
    }
    // RECENTES (padrão)
    return b.data_postagem.localeCompare(a.data_postagem);
  });

  // 3. Paginação
  const totalPaginas = Math.ceil(previasOrdenadas.length / itensPorPagina) || 1;
  // Métricas
  const totalIniciacoes = previas.filter(p => p.tipo.toUpperCase() === 'INICIACAO').length;
  const totalFiliacoes = previas.filter(p => p.tipo.toUpperCase() === 'FILIACAO').length;
  const totalRegularizacoes = previas.filter(p => p.tipo.toUpperCase() === 'REGULARIZACAO').length;
  const totalAveriguadas = previas.filter(p => p.status === 'AVERIGUADO').length;
  const totalPendentes = previas.length - totalAveriguadas;

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo.toUpperCase()) {
      case 'INICIACAO':
        return 'bg-sigma-elevated border border-sigma-border text-amber-400 border-amber-500/30';
      case 'FILIACAO':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'REGULARIZACAO':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const formatarData = (isoStr: string) => {
    if (!isoStr) return '--/--/----';
    const [ano, mes, dia] = isoStr.split('T')[0].split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const formatarDataHora = (isoStr: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading && previas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#facc15]" />
        <span className="text-sm">Carregando Mural de Admissão...</span>
      </div>
    );
  }

  if (erro && previas.length === 0) {
    return (
      <div className="min-h-screen bg-sigma-bg flex items-center justify-center p-6 text-gray-200">
        <div className="max-w-md w-full p-8 text-center bg-sigma-surface border border-sigma-border rounded-2xl shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto bg-sigma-elevated border border-sigma-border border border-amber-500/20 rounded-2xl flex items-center justify-center text-[#facc15]">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Acesso Restrito ao Mural</h2>
            <p className="text-xs text-gray-400">{erro}</p>
          </div>

          <button
            onClick={() => carregarDados()}
            className="w-full py-2.5 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-bold text-xs rounded-xl transition-all shadow-md"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8 min-h-0 bg-[#080808]">
      
      {/* HEADER DO PAINEL */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to={`/regiao/${id}`}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            title="Voltar ao Painel Geral"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-sigma-accent">Mural de Admissões</h1>
            <p className="text-[10px] text-gray-400">Propostas de Iniciação, Filiação e Regularização</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Busca Desktop */}
          <div className="hidden sm:block relative w-48 lg:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text"
              placeholder="Buscar candidato..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#1f2937] border border-sigma-border rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
            />
          </div>
          <button
            onClick={() => setShowNovaPreviaModal(true)}
            className="w-14 h-14 bg-[#1f2937] border border-sigma-border rounded-xl flex items-center justify-center text-white hover:bg-[#2d3748] transition-colors shadow-md"
            title="Nova Admissão"
          >
            <div className="relative">
              <BookOpenCheck className="w-7 h-7" />
              <Plus className="w-4 h-4 absolute -top-1 -right-2 bg-sigma-surface rounded-full border border-sigma-border" />
            </div>
          </button>
        </div>
      </div>

      {/* TABS (Folder Style) */}
      <div className="flex px-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setFiltroTipo('INICIACAO')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-t-xl text-sm font-bold transition-all ${
            filtroTipo === 'INICIACAO'
              ? 'bg-sigma-gold text-[#070F1E]'
              : 'bg-sigma-surface text-white hover:bg-[#2d3748]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Iniciação</span>
          {totalIniciacoes > 0 && (
            <span className={`min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-black flex items-center justify-center ml-1 ${
              filtroTipo === 'INICIACAO' ? 'bg-[#070F1E] text-sigma-accent' : 'bg-sigma-elevated text-white'
            }`}>
              {totalIniciacoes}
            </span>
          )}
        </button>
        
        <button
          type="button"
          onClick={() => setFiltroTipo('FILIACAO')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-t-xl text-sm font-bold transition-all ${
            filtroTipo === 'FILIACAO'
              ? 'bg-blue-500 text-[#070F1E]'
              : 'bg-sigma-surface text-white hover:bg-[#2d3748]'
          }`}
        >
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">Filiação</span>
          {totalFiliacoes > 0 && (
            <span className={`min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-black flex items-center justify-center ml-1 ${
              filtroTipo === 'FILIACAO' ? 'bg-[#070F1E] text-blue-400' : 'bg-sigma-elevated text-white'
            }`}>
              {totalFiliacoes}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setFiltroTipo('REGULARIZACAO')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-t-xl text-sm font-bold transition-all ${
            filtroTipo === 'REGULARIZACAO'
              ? 'bg-purple-500 text-white'
              : 'bg-sigma-surface text-white hover:bg-[#2d3748]'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">Regularização</span>
          {totalRegularizacoes > 0 && (
            <span className={`min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-black flex items-center justify-center ml-1 ${
              filtroTipo === 'REGULARIZACAO' ? 'bg-[#070F1E] text-purple-400' : 'bg-sigma-elevated text-white'
            }`}>
              {totalRegularizacoes}
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO PRINCIPAL (Grid e Cards) */}
      <div className="bg-sigma-surface border border-sigma-border rounded-b-xl rounded-tr-xl flex-1 flex flex-col overflow-hidden shadow-2xl relative min-h-0">
        
        {/* Mobile Search - Só aparece se tela menor que sm */}
        <div className="sm:hidden p-3 border-b border-sigma-border bg-sigma-elevated shrink-0">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text"
                placeholder="Buscar candidato..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1f2937] border border-sigma-border rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
              />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          {/* Grid de Cards de Prévias (Dogear Layout) */}

          {previasOrdenadas.length === 0 ? (
            <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-gray-400 mt-6">
              <BookOpenCheck className="w-12 h-12 mx-auto mb-3 text-gray-600 stroke-[1.5]" />
              <h3 className="text-base font-bold text-gray-300 mb-1">Nenhuma prévia encontrada</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Não há pedidos de admissão correspondentes aos filtros selecionados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
              {previasOrdenadas.map((previa) => {
                // Rotação sutil e aleatória para simular fixação real no mural
                const rot = (previa.id.charCodeAt(0) % 5) - 2; // -2 a +2 graus

                const isAveriguado = previa.status === 'AVERIGUADO';
                const hasConsideracoes = previa.total_consideracoes > 0;
                
                // Cores baseadas no Status, seguindo a lógica do Mural
                let cor = { bg: 'bg-red-500/20', border: 'border-red-500/50', hex: 'rgba(239, 68, 68, 0.6)', text: 'text-red-400', Icon: Sparkles, label: 'Nova Prévia' };
                if (isAveriguado) {
                    cor = { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', hex: 'rgba(16, 185, 129, 0.6)', text: 'text-emerald-400', Icon: CheckCheck, label: 'Averiguada' };
                } else if (hasConsideracoes) {
                    cor = { bg: 'bg-sigma-elevated', border: 'border-amber-500/50', hex: 'rgba(245, 158, 11, 0.6)', text: 'text-amber-400', Icon: MessageSquare, label: 'Em Análise' };
                }

                // Cor da tag de tipo
                const tipoColor = previa.tipo === 'INICIACAO' ? 'text-[#facc15]' : (previa.tipo === 'FILIACAO' ? 'text-blue-400' : 'text-purple-400');

                return (
                    <div 
                      key={previa.id}
                      className="crvm-dogear-wrapper relative"
                      style={{ '--dogear-border': cor.hex, transform: `rotate(${rot}deg)` } as any}
                    >
                      {/* Simulação de alfinete (Pin) fixando o documento no topo */}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 drop-shadow-md">
                        <Pin className="w-5 h-5 text-sigma-accent fill-sigma-accent/30" />
                      </div>
                      <div
                        onClick={() => abrirModalConsideracoes(previa)}
                        className={`crvm-dogear-card p-3 min-h-[140px] flex flex-col justify-between cursor-pointer group-hover:brightness-110 transition-all ${isAveriguado ? 'opacity-60 saturate-[0.8]' : ''}`}
                      >
                        <div className="crvm-dogear-fold"></div>
                        <div>
                            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2 ${cor.text}`}>
                                <cor.Icon className="w-3.5 h-3.5" />
                                {cor.label}
                            </div>
                            <h4 className="text-xs sm:text-sm font-bold text-white leading-tight pr-5 mb-1 line-clamp-2" title={previa.candidato_nome}>
                                {previa.candidato_nome}
                            </h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5" title={previa.loja_nome}>
                                Loja: {previa.loja_nome}
                            </p>
                        </div>
                        
                        <div className="self-end mt-3 flex items-center gap-1.5 flex-wrap justify-end">
                            {hasConsideracoes && !isAveriguado && (
                                <div className="flex items-center gap-1 text-gray-300 bg-black/40 px-1.5 py-0.5 rounded text-[9px] font-bold border border-white/10" title="Pareceres enviados">
                                    <MessageSquare className="w-3 h-3" /> {previa.total_consideracoes}
                                </div>
                            )}
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border border-white/5 bg-black/20 ${tipoColor}`}>
                                {previa.tipo_label}
                            </div>
                        </div>
                      </div>
                    </div>
                );
              })}
            </div>
          )
          }
        </div>

        {/* SPLIT FOOTER */}
        <div className="grid grid-cols-2 border-t border-sigma-border bg-sigma-elevated mt-auto shrink-0">
          <button 
            onClick={() => setFiltroStatus(s => s === 'TODOS' ? 'EM_ANDAMENTO' : 'TODOS')}
            className={`flex items-center justify-between p-4 border-r border-sigma-border transition-colors cursor-pointer ${filtroStatus === 'TODOS' ? 'bg-emerald-500/10 hover:bg-emerald-500/20' : 'hover:bg-white/5'}`}
          >
            <div className="flex items-center gap-2">
              <CheckCheck className={`w-5 h-5 ${filtroStatus === 'TODOS' ? 'text-emerald-400' : 'text-gray-400'}`} />
              <div className="text-left leading-tight">
                <span className="text-[10px] font-bold block">{filtroStatus === 'TODOS' ? 'Ocultar' : 'Ver'}</span>
                <span className="text-[11px] font-bold">Averiguadas</span>
              </div>
            </div>
            {filtroStatus === 'TODOS' && (
              <span className="text-sm font-black text-emerald-400">
                {totalAveriguadas}
              </span>
            )}
          </button>
          
          <div className="flex items-center justify-between p-4 bg-transparent">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <div className="text-left leading-tight">
                <span className="text-[10px] font-bold block">Em</span>
                <span className="text-[11px] font-bold">Análise</span>
              </div>
            </div>
            <span className="text-sm font-black text-white">
              {totalPendentes}
            </span>
          </div>
        </div>
      </div>

      {/* MODAL DE CONSIDERAÇÕES INCREMENTAIS (Agora como Drawer/Slide-over) */}
      {previaSelecionada && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Overlay escuro */}
          <div 
            className="absolute inset-0 bg-sigma-bg/80 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setPreviaSelecionada(null)} 
          />
          
          {/* Painel lateral (Drawer) */}
          <div className="relative w-full sm:w-[500px] md:w-[600px] lg:w-[700px] max-w-full h-full bg-sigma-surface border-l border-sigma-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            
            <div className="px-6 py-4 bg-sigma-elevated border-b border-sigma-border flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${getTipoBadgeColor(previaSelecionada.tipo)}`}>
                    {previaSelecionada.tipo_label}
                  </span>

                  {previaSelecionada.status === 'AVERIGUADO' ? (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                      <CheckCheck className="w-3 h-3" />
                      Averiguado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-sigma-elevated border border-sigma-border text-amber-400 border-amber-500/20 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Em Aberto
                    </span>
                  )}

                  <span className="text-xs text-gray-400">
                    Fixada em {formatarData(previaSelecionada.data_postagem)}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white">
                  {previaSelecionada.titulo_formatado}
                </h3>
                <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                  Candidato: <b>{previaSelecionada.candidato_nome}</b> | Loja: <b>{previaSelecionada.loja_nome} {previaSelecionada.loja_numero ? `nº ${previaSelecionada.loja_numero}` : ''}</b>
                </p>
                {previaSelecionada.data_limite && (
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Prazo de Considerações: {formatarData(previaSelecionada.data_limite)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPreviaSelecionada(null)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-sigma-elevated rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Destaque do PDF */}
              <div className="bg-sigma-elevated border border-sigma-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/10 rounded-xl">
                    <FileText className="w-8 h-8 text-red-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Documento Oficial de Prévia</h4>
                    <p className="text-xs text-gray-400 truncate max-w-[200px] sm:max-w-[300px]">
                      {previaSelecionada.pdf_nome_original || 'documento_oficial.pdf'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPdfPreviewModal(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/pdf`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sigma-elevated hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-sigma-border transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#facc15]" />
                    Ler Online
                  </button>
                  <a
                    href={`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/pdf?download=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sigma-elevated hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-sigma-border transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400" />
                    Baixar PDF
                  </a>
                </div>
              </div>

              {/* Barra de Status & Ação de Homologação/Verificação */}
              <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                previaSelecionada.status === 'AVERIGUADO'
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-sigma-elevated border border-sigma-border border-amber-500/20 text-amber-300'
              }`}>
                <div className="flex items-center gap-3">
                  {previaSelecionada.status === 'AVERIGUADO' ? (
                    <CheckCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 text-amber-400 flex-shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-bold block">
                      {previaSelecionada.status === 'AVERIGUADO'
                        ? 'Processo Marcado como Averiguado'
                        : 'Processo em Aberto para Averiguação'}
                    </span>
                    <span className="text-[11px] opacity-80 block">
                      {previaSelecionada.status === 'AVERIGUADO'
                        ? `Verificado por ${previaSelecionada.verificado_por_nome || 'Conselho Regional'}`
                        : 'Sindicâncias e pareceres de Veneráveis Mestres são confidenciais ao conselho.'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleAlternarStatus(previaSelecionada.id, previaSelecionada.status)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    previaSelecionada.status === 'AVERIGUADO'
                      ? 'bg-sigma-elevated hover:bg-sigma-elevated text-gray-300 border-sigma-border'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                  }`}
                >
                  {previaSelecionada.status === 'AVERIGUADO' ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reabrir Averiguação
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Marcar como Averiguado
                    </>
                  )}
                </button>
              </div>

              {/* Accordion de Pareceres e Votos */}
              <div className="border border-sigma-border rounded-xl overflow-hidden bg-[#0a0a0a]">
                <button
                  onClick={() => setPareceresAbertos(!pareceresAbertos)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-sigma-surface hover:bg-sigma-elevated transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <MessageSquare className="w-4 h-4 text-[#facc15]" />
                    Pareceres e Votos do Conselho ({consideracoes.length})
                  </div>
                  {pareceresAbertos ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                
                {pareceresAbertos && (
                  <div className="p-4 space-y-6 border-t border-sigma-border">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        Pareceres Registrados
                      </h4>

                      {carregandoConsideracoes ? (
                        <div className="py-8 text-center text-gray-500 flex items-center justify-center gap-2 text-xs">
                          <Loader2 className="w-4 h-4 animate-spin text-[#facc15]" />
                          Carregando pareceres...
                        </div>
                      ) : consideracoes.length === 0 ? (
                        <div className="p-6 bg-sigma-surface border border-sigma-border rounded-xl text-center text-gray-500 text-xs">
                          Nenhum parecer ou consideração foi registrado ainda para esta prévia.<br/>
                          Utilize o formulário abaixo para inserir o primeiro apontamento.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {consideracoes.map((c) => (
                            <div 
                              key={c.id}
                              className="bg-sigma-surface border border-sigma-border rounded-xl p-4 transition-all"
                            >
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-sigma-elevated border border-sigma-border border border-[#facc15]/20 flex items-center justify-center text-[#facc15] text-xs font-bold">
                                    {c.autor_nome.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-white block">
                                      {c.autor_nome}
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                      {c.autor_cargo} • {c.loja_nome} {c.loja_numero ? `nº ${c.loja_numero}` : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                  <span>{formatarDataHora(c.data_criacao)}</span>
                                  {c.pode_excluir && (
                                    <button
                                      onClick={() => handleExcluirConsideracao(c.id)}
                                      className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                      title="Ocultar parecer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="text-xs text-gray-300 pl-9 whitespace-pre-wrap leading-relaxed">
                                {c.conteudo}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleEnviarConsideracao} className="bg-sigma-elevated border border-sigma-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 text-[#facc15]" />
                          Adicionar Nova Consideração / Parecer
                        </label>
                        <span className="text-[11px] text-gray-400">
                          Manifestando-se como: <b className="text-[#facc15]">{userContext.role}</b>
                        </span>
                      </div>

                      <textarea
                        rows={3}
                        value={novaConsideracaoTexto}
                        onChange={(e) => setNovaConsideracaoTexto(e.target.value)}
                        placeholder="Insira apontamentos sobre sindicâncias, reputação, idoneidade ou conformidade maçônica..."
                        className="w-full p-3 bg-sigma-surface border border-sigma-border rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] transition-colors resize-none"
                        required
                      />

                      <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                          type="submit"
                          disabled={enviandoConsideracao || !novaConsideracaoTexto.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-sigma-gold text-[#070F1E] shadow-md hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-md transition-all"
                        >
                          {enviandoConsideracao ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Registrando...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              Registrar Parecer no Mural
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PUBLICAÇÃO DE NOVA PRÉVIA */}
      {showNovaPreviaModal && (
        <div className="fixed inset-0 z-50 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-sigma-elevated border-b border-sigma-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sigma-elevated border border-sigma-border text-[#facc15] rounded-lg">
                  <BookOpenCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Publicar Prévia de Admissão
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Fixação no Mural Regional para averiguação e considerações
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNovaPreviaModal(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-sigma-elevated rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaPrevia} className="p-6 space-y-4">
              
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Natureza do Processo *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['INICIACAO', 'FILIACAO', 'REGULARIZACAO'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormPrevia(prev => ({ ...prev, tipo: t }))}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        formPrevia.tipo === t 
                          ? 'bg-sigma-gold text-[#070F1E] shadow-md border-[#facc15]' 
                          : 'bg-sigma-surface text-gray-400 border-[#2a2a2a] hover:border-[#444]'
                      }`}
                    >
                      {t === 'INICIACAO' ? 'Iniciação' : t === 'FILIACAO' ? 'Filiação' : 'Regularização'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Loja Proponente *
                </label>
                <select
                  value={formPrevia.loja_id}
                  onChange={(e) => {
                    const sel = lojasConselho.find(l => l.id.toString() === e.target.value);
                    if (sel) {
                      setFormPrevia(prev => ({
                        ...prev,
                        loja_id: sel.id.toString(),
                        loja_nome: sel.nome,
                        loja_numero: sel.numero || 'S/N'
                      }));
                    }
                  }}
                  className="w-full px-3 py-2 bg-sigma-surface border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15] cursor-pointer"
                  required
                >
                  {lojasConselho.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} nº {l.numero || 'S/N'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Nome Completo do Candidato / Proposto *
                </label>
                <input
                  type="text"
                  value={formPrevia.candidato_nome}
                  onChange={(e) => setFormPrevia(prev => ({ ...prev, candidato_nome: e.target.value }))}
                  placeholder="Ex: Carlos Eduardo Silva"
                  className="w-full px-3 py-2 bg-sigma-surface border border-[#2e2e2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Data Limite para Considerações (Opcional - padrão: 30 dias)
                </label>
                <CampoData
                  value={formPrevia.data_limite}
                  onChange={(v) => setFormPrevia(prev => ({ ...prev, data_limite: v }))}
                  className="w-full px-3 py-2 bg-sigma-surface border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Documento PDF da Prancha (Opcional)
                </label>
                <div className="border-2 border-dashed border-sigma-border hover:border-[#444] rounded-xl p-4 text-center bg-[#0a0a0a] transition-colors">
                  <input
                    type="file"
                    accept="application/pdf"
                    id="pdf-upload"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setArquivoPdf(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-1.5">
                    <FileText className="w-8 h-8 text-[#facc15]" />
                    <span className="text-xs font-semibold text-gray-200">
                      {arquivoPdf ? arquivoPdf.name : 'Clique para selecionar o PDF da Prancha'}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {arquivoPdf 
                        ? `${(arquivoPdf.size / 1024).toFixed(1)} KB selecionados` 
                        : 'Se não enviado, o sistema gerará a Prancha Oficial em PDF automaticamente.'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sigma-border">
                <button
                  type="button"
                  onClick={() => setShowNovaPreviaModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoPrevia}
                  className="flex items-center gap-2 px-5 py-2 bg-sigma-gold text-[#070F1E] shadow-md hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  {salvandoPrevia ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Publicar Prévia
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DIRETA DO PDF */}
      {pdfPreviewModal && (
        <div className="fixed inset-0 z-50 bg-sigma-bg/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-3 bg-sigma-elevated border-b border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <FileText className="w-4 h-4 text-[#facc15]" />
                Visualização do Documento Oficial (PDF)
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`${pdfPreviewModal}?download=true`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 bg-sigma-elevated hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-sigma-border transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-gray-400" />
                  Baixar Arquivo
                </a>
                <button
                  onClick={() => setPdfPreviewModal(null)}
                  className="p-1 text-gray-400 hover:text-white hover:bg-sigma-elevated rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-sigma-elevated p-1">
              <iframe
                src={pdfPreviewModal}
                title="Prévia do Documento PDF"
                className="w-full h-full rounded-xl border-0"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
