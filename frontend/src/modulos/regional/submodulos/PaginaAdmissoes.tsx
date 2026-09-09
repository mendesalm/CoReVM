// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  BookOpenCheck, ShieldCheck, Loader2, Award, 
  Plus, Search, ArrowLeft, FileText, Download, ExternalLink,
  MessageSquare, Calendar, Trash2, Send, CheckCircle2,
  Clock, Sparkles, User, X, Eye, CheckCheck, RotateCcw,
  SlidersHorizontal, ChevronLeft, ChevronRight
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

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
  
  // Controle de Usuário e RBAC
  const [activeUserId, setActiveUserId] = useState('CIM_12345_PRESIDENTE');
  const [userContext, setUserContext] = useState<any>({
    usuario_id: activeUserId,
    role: 'PRESIDENTE',
    is_diretoria: true,
    loja_id: null
  });

  // Filtros, Busca, Ordenação e Paginação
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODAS' | 'INICIACAO' | 'FILIACAO' | 'REGULARIZACAO'>('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'EM_ANDAMENTO' | 'AVERIGUADO'>('TODOS');
  const [ordenacao, setOrdenacao] = useState<'RECENTES' | 'PRAZO' | 'PARECERES' | 'PENDENTES_PRIMEIRO'>('RECENTES');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(6);

  // Modal de Considerações
  const [previaSelecionada, setPreviaSelecionada] = useState<PreviaAdmissaoItem | null>(null);
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
    const headers = { 'X-User-Id': activeUserId };

    try {
      // 1. Prévias de Admissão
      try {
        const previasRes = await axios.get(`${API_URL}/regional/${id}/admissoes`, { headers });
        setPrevias(previasRes.data || []);
      } catch (errPrevias: any) {
        console.error('Erro ao buscar prévias:', errPrevias);
        setErro(errPrevias.response?.data?.detail || 'Não foi possível carregar os pedidos de admissão do conselho.');
      }

      // 2. Contexto do Usuário (RBAC)
      try {
        const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
        if (userRes.data) setUserContext(userRes.data);
      } catch (errUser) {
        console.warn('Contexto do usuário não pôde ser carregado:', errUser);
      }

      // 3. Lojas do Conselho (para o select de nova prévia)
      try {
        const lojasRes = await axios.get(`${API_URL}/regional/${id}/lojas`, { headers });
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
  }, [id, activeUserId]);

  // Resetar paginação ao filtrar ou buscar
  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, filtroTipo, filtroStatus, ordenacao, itensPorPagina]);

  // Alternar Status de Verificação (Marcar como Averiguado / Em Aberto)
  const handleAlternarStatus = async (previaId: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'AVERIGUADO' ? 'EM_ANDAMENTO' : 'AVERIGUADO';
    try {
      const res = await axios.put(
        `${API_URL}/regional/${id}/admissoes/${previaId}/status`,
        { status: novoStatus },
        { headers: { 'X-User-Id': activeUserId } }
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
      alert('Erro ao atualizar verificação: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Abrir Modal de Considerações
  const abrirModalConsideracoes = async (previa: PreviaAdmissaoItem) => {
    setPreviaSelecionada(previa);
    setCarregandoConsideracoes(true);
    setNovaConsideracaoTexto('');
    try {
      const res = await axios.get(`${API_URL}/regional/${id}/admissoes/${previa.id}/consideracoes`, {
        headers: { 'X-User-Id': activeUserId }
      });
      setConsideracoes(res.data || []);
    } catch (err: any) {
      alert('Erro ao carregar pareceres da prévia: ' + (err.response?.data?.detail || err.message));
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

      await axios.post(
        `${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes`,
        {
          conteudo: novaConsideracaoTexto.trim(),
          autor_nome: nomeAutor,
          autor_cargo: userContext.role || 'Venerável Mestre'
        },
        { headers: { 'X-User-Id': activeUserId } }
      );

      const res = await axios.get(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes`, {
        headers: { 'X-User-Id': activeUserId }
      });
      setConsideracoes(res.data || []);
      setNovaConsideracaoTexto('');

      setPrevias(prev => prev.map(p => p.id === previaSelecionada.id ? { ...p, total_consideracoes: res.data.length } : p));
    } catch (err: any) {
      alert('Erro ao registrar consideração: ' + (err.response?.data?.detail || err.message));
    } finally {
      setEnviandoConsideracao(false);
    }
  };

  // Excluir Consideração
  const handleExcluirConsideracao = async (consId: string) => {
    if (!previaSelecionada || !confirm('Deseja realmente ocultar este parecer?')) return;
    try {
      await axios.delete(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/consideracoes/${consId}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      setConsideracoes(prev => prev.filter(c => c.id !== consId));
      setPrevias(prev => prev.map(p => p.id === previaSelecionada.id ? { ...p, total_consideracoes: Math.max(0, p.total_consideracoes - 1) } : p));
    } catch (err: any) {
      alert('Erro ao excluir consideração: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Excluir Prévia (Deleção Visual)
  const handleExcluirPrevia = async (previaId: string) => {
    if (!confirm('Deseja realmente ocultar esta prévia do Mural de Admissão?')) return;
    try {
      await axios.delete(`${API_URL}/regional/${id}/admissoes/${previaId}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      setPrevias(prev => prev.filter(p => p.id !== previaId));
      if (previaSelecionada?.id === previaId) {
        setPreviaSelecionada(null);
      }
    } catch (err: any) {
      alert('Erro ao remover prévia: ' + (err.response?.data?.detail || err.message));
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
      const headers = { 'X-User-Id': activeUserId };

      if (arquivoPdf) {
        const formData = new FormData();
        formData.append('tipo', formPrevia.tipo);
        formData.append('loja_id', formPrevia.loja_id);
        formData.append('loja_nome', formPrevia.loja_nome);
        formData.append('loja_numero', formPrevia.loja_numero);
        formData.append('candidato_nome', formPrevia.candidato_nome.trim());
        if (formPrevia.data_limite) formData.append('data_limite', formPrevia.data_limite);
        formData.append('arquivo', arquivoPdf);

        await axios.post(`${API_URL}/regional/${id}/admissoes/upload`, formData, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await axios.post(`${API_URL}/regional/${id}/admissoes`, {
          tipo: formPrevia.tipo,
          loja_id: formPrevia.loja_id,
          loja_nome: formPrevia.loja_nome,
          loja_numero: formPrevia.loja_numero,
          candidato_nome: formPrevia.candidato_nome.trim(),
          data_limite: formPrevia.data_limite || null
        }, { headers });
      }

      setShowNovaPreviaModal(false);
      setArquivoPdf(null);
      setFormPrevia(prev => ({ ...prev, candidato_nome: '', data_limite: '' }));
      carregarDados();
    } catch (err: any) {
      alert('Erro ao publicar prévia: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSalvandoPrevia(false);
    }
  };

  // 1. Filtragem
  const previasFiltradas = previas.filter(p => {
    const atendeFiltroTipo = filtroTipo === 'TODAS' || p.tipo.toUpperCase() === filtroTipo;
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
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const indexFim = itensPorPagina === 9999 ? previasOrdenadas.length : indexInicio + itensPorPagina;
  const previasPaginadas = itensPorPagina === 9999 ? previasOrdenadas : previasOrdenadas.slice(indexInicio, indexFim);

  // Métricas
  const totalIniciacoes = previas.filter(p => p.tipo.toUpperCase() === 'INICIACAO').length;
  const totalFiliacoes = previas.filter(p => p.tipo.toUpperCase() === 'FILIACAO').length;
  const totalRegularizacoes = previas.filter(p => p.tipo.toUpperCase() === 'REGULARIZACAO').length;
  const totalAveriguadas = previas.filter(p => p.status === 'AVERIGUADO').length;
  const totalPendentes = previas.length - totalAveriguadas;

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo.toUpperCase()) {
      case 'INICIACAO':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
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
      <div className="min-h-screen bg-[#080808] flex items-center justify-center p-6 text-gray-200">
        <div className="max-w-md w-full p-8 text-center bg-[#141414] border border-[#2b2b2b] rounded-2xl shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-[#facc15]">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Acesso Restrito ao Mural</h2>
            <p className="text-xs text-gray-400">{erro}</p>
          </div>

          <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-xl text-xs space-y-2">
            <span className="text-gray-400 font-semibold block">Simular Acesso Autorizado:</span>
            <select
              value={activeUserId}
              onChange={(e) => setActiveUserId(e.target.value)}
              className="w-full bg-[#181818] text-[#facc15] border border-[#333] rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="CIM_12345_PRESIDENTE">Presidente (Diretoria)</option>
              <option value="272875">Secretário (Mesa Diretora)</option>
              <option value="superadmin">SuperAdmin</option>
              <option value="VM_1">VM - João Pedro Junqueira nº 2181</option>
              <option value="VM_135">VM - Acácia Amarela nº 4305</option>
            </select>
          </div>

          <button
            onClick={() => carregarDados()}
            className="w-full py-2.5 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs rounded-xl transition-all shadow-md"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200">
      
      {/* Header Superior com Simulação de Acesso */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              to={`/regiao/${id}`} 
              className="p-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f] rounded-xl transition-colors"
              title="Voltar ao Painel Geral"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2.5 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/20">
              <BookOpenCheck className="w-6 h-6"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-wide">
                  Mural de Admissão
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20">
                  {previas.length} documentos
                </span>
                {totalAveriguadas > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" />
                    {totalAveriguadas} averiguadas
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Propostas de Iniciação, Filiação ou Regularização
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#141414] border border-[#2a2a2a] px-3 py-1.5 rounded-xl text-xs">
              <span className="text-gray-400 font-medium">Acesso Simulado:</span>
              <select 
                value={activeUserId} 
                onChange={(e) => setActiveUserId(e.target.value)}
                className="bg-[#0c0c0c] text-[#facc15] border border-[#333] rounded-lg px-2.5 py-1 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="CIM_12345_PRESIDENTE">Presidente (Diretoria)</option>
                <option value="272875">Secretário (Mesa Diretora)</option>
                <option value="superadmin">SuperAdmin</option>
                <option value="VM_1">VM - João Pedro Junqueira nº 2181</option>
                <option value="VM_135">VM - Acácia Amarela nº 4305</option>
                <option value="VM_141">VM - Winston Churchill nº 2216</option>
              </select>
            </div>

            <button
              onClick={() => setShowNovaPreviaModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs rounded-xl shadow-lg shadow-[#facc15]/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Publicar Nova Prévia
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-6">
        
        {/* Painel de Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Total de Prévias</span>
              <span className="text-xl font-black text-white">{previas.length}</span>
            </div>
            <div className="p-2 bg-[#facc15]/10 text-[#facc15] rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Iniciações</span>
              <span className="text-xl font-black text-amber-400">{totalIniciacoes}</span>
            </div>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Filiações</span>
              <span className="text-xl font-black text-blue-400">{totalFiliacoes}</span>
            </div>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Regularizações</span>
              <span className="text-xl font-black text-purple-400">{totalRegularizacoes}</span>
            </div>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Averiguadas</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-emerald-400">{totalAveriguadas}</span>
                <span className="text-[11px] text-gray-500 font-semibold">/ {totalPendentes} pendentes</span>
              </div>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <CheckCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Barra de Filtros por Modalidade & Status */}
        <div className="bg-[#121212] border border-[#222] rounded-2xl p-4 space-y-3">
          
          {/* Linha 1: Abas por Natureza do Processo */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setFiltroTipo('TODAS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'TODAS' 
                    ? 'bg-[#facc15] text-black shadow-md shadow-[#facc15]/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Todas ({previas.length})
              </button>
              <button
                onClick={() => setFiltroTipo('INICIACAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'INICIACAO' 
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Iniciações ({totalIniciacoes})
              </button>
              <button
                onClick={() => setFiltroTipo('FILIACAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'FILIACAO' 
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Filiações ({totalFiliacoes})
              </button>
              <button
                onClick={() => setFiltroTipo('REGULARIZACAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'REGULARIZACAO' 
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Regularizações ({totalRegularizacoes})
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative min-w-[260px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text"
                placeholder="Buscar candidato, loja ou número..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#0c0c0c] border border-[#2b2b2b] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] transition-colors"
              />
            </div>
          </div>

          {/* Linha 2: Filtro por Verificação + Ordenação + Paginação */}
          <div className="pt-2 border-t border-[#1e1e1e] flex flex-wrap items-center justify-between gap-3 text-xs">
            
            {/* Filtro de Status de Verificação */}
            <div className="flex items-center gap-1 bg-[#0a0a0a] border border-[#222] p-1 rounded-xl">
              <button
                onClick={() => setFiltroStatus('TODOS')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filtroStatus === 'TODOS' 
                    ? 'bg-[#252525] text-white shadow' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Todos os Status
              </button>
              <button
                onClick={() => setFiltroStatus('EM_ANDAMENTO')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  filtroStatus === 'EM_ANDAMENTO' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'text-gray-400 hover:text-amber-300'
                }`}
              >
                <Clock className="w-3 h-3 text-amber-400" />
                Em Aberto ({totalPendentes})
              </button>
              <button
                onClick={() => setFiltroStatus('AVERIGUADO')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  filtroStatus === 'AVERIGUADO' 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'text-gray-400 hover:text-emerald-300'
                }`}
              >
                <CheckCheck className="w-3 h-3 text-emerald-400" />
                Averiguados ({totalAveriguadas})
              </button>
            </div>

            {/* Ordenação e Seleção de Itens por Página */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-400 font-medium">Ordenar por:</span>
                <select
                  value={ordenacao}
                  onChange={(e: any) => setOrdenacao(e.target.value)}
                  className="bg-[#0a0a0a] text-gray-200 border border-[#2e2e2e] rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="RECENTES">Mais Recentes</option>
                  <option value="PRAZO">Prazo mais Próximo</option>
                  <option value="PARECERES">Mais Pareceres</option>
                  <option value="PENDENTES_PRIMEIRO">Pendentes Primeiro</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 font-medium">Exibir:</span>
                <select
                  value={itensPorPagina}
                  onChange={(e) => setItensPorPagina(Number(e.target.value))}
                  className="bg-[#0a0a0a] text-gray-200 border border-[#2e2e2e] rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value={6}>6 por página</option>
                  <option value={9}>9 por página</option>
                  <option value={12}>12 por página</option>
                  <option value={9999}>Todas</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Grid de Cards de Prévias */}
        {previasOrdenadas.length === 0 ? (
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-gray-400">
            <BookOpenCheck className="w-12 h-12 mx-auto mb-3 text-gray-600 stroke-[1.5]" />
            <h3 className="text-base font-bold text-gray-300 mb-1">Nenhuma prévia encontrada</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Não há pedidos de admissão correspondentes aos filtros selecionados. Clique em "Publicar Nova Prévia" ou redefina os filtros.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {previasPaginadas.map((previa) => {
              const isAveriguado = previa.status === 'AVERIGUADO';
              const downloadPdfUrl = `${API_URL}/regional/${id}/admissoes/${previa.id}/pdf?download=true`;
              const viewPdfUrl = `${API_URL}/regional/${id}/admissoes/${previa.id}/pdf`;

              return (
                <div 
                  key={previa.id}
                  className={`border rounded-2xl p-5 shadow-xl transition-all duration-200 flex flex-col justify-between group relative ${
                    isAveriguado 
                      ? 'bg-gradient-to-b from-emerald-950/20 via-[#131414] to-[#141414] border-emerald-500/40 hover:border-emerald-500/60 shadow-emerald-950/20' 
                      : 'bg-[#141414] border-[#252525] hover:border-[#383838]'
                  }`}
                >
                  <div>
                    {/* Cabeçalho do Card: Badges de Tipo, Status de Verificação e Data */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md border tracking-wider ${getTipoBadgeColor(previa.tipo)}`}>
                          {previa.tipo_label}
                        </span>

                        {/* Selo de Verificação */}
                        {isAveriguado ? (
                          <span 
                            className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md border tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1 shadow-sm shadow-emerald-500/10"
                            title={previa.verificado_por_nome ? `Averiguado por ${previa.verificado_por_nome}` : 'Averiguado pelo Conselho'}
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Averiguado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border tracking-wider bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            Em Aberto
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        <span>{formatarData(previa.data_postagem)}</span>
                        
                        {previa.pode_editar && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExcluirPrevia(previa.id);
                            }}
                            className="p-1 text-gray-500 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors ml-1"
                            title="Ocultar esta prévia"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Título do Card Obrigatório */}
                    <h2 className="text-sm font-bold text-white leading-snug group-hover:text-[#facc15] transition-colors mb-2">
                      {previa.titulo_formatado}
                    </h2>

                    {/* Candidato Proposto */}
                    <div className="flex items-center gap-2 p-2.5 bg-[#0d0d0d] border border-[#222] rounded-xl mb-3.5">
                      <div className={`p-1.5 rounded-lg ${isAveriguado ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#facc15]/10 text-[#facc15]'}`}>
                        <User className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <span className="text-[10px] font-semibold text-gray-400 block uppercase tracking-wider">Candidato Proposto</span>
                        <span className="text-xs font-bold text-gray-100 truncate block">
                          {previa.candidato_nome}
                        </span>
                      </div>
                    </div>

                    {/* Miniatura Visual do Documento PDF */}
                    <div className="relative bg-[#0d0d0d] border border-[#242424] rounded-xl p-3.5 mb-4">
                      <div className="flex items-center gap-3">
                        
                        {/* Mockup Miniatura Folha PDF */}
                        <div className="w-14 h-18 bg-[#f8fafc] border border-gray-300 rounded-md p-1.5 flex flex-col justify-between shadow-md relative overflow-hidden flex-shrink-0">
                          <div className="w-full text-center text-[5px] font-black text-amber-700 tracking-tighter">
                            A.'.G.'.D.'.G.'.
                          </div>
                          
                          <div className="space-y-1 my-1">
                            <div className="h-1 bg-gray-300 rounded-full w-full"></div>
                            <div className="h-1 bg-gray-300 rounded-full w-4/5"></div>
                            <div className="h-1 bg-amber-400/80 rounded-full w-3/5"></div>
                            <div className="h-1 bg-gray-300 rounded-full w-5/6"></div>
                          </div>

                          <div className="bg-red-600 text-white font-black text-[6px] px-1 py-0.5 rounded text-center uppercase tracking-tighter">
                            PDF
                          </div>
                        </div>

                        {/* Detalhes do Documento */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-gray-200 truncate">
                              {previa.pdf_nome_original}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 block">
                            Prancha Oficial de Prévia
                          </span>
                          {previa.data_limite && (
                            <span className="text-[10px] text-amber-400/90 flex items-center gap-1 mt-1 font-medium">
                              <Clock className="w-3 h-3" />
                              Prazo: {formatarData(previa.data_limite)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações Rápidas do PDF */}
                      <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-[#222]">
                        <button
                          onClick={() => setPdfPreviewModal(viewPdfUrl)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#facc15]" />
                          Visualizar
                        </button>
                        <a
                          href={downloadPdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-gray-400" />
                          Baixar
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card: Contador de Pareceres, Botão de Verificação e Abertura do Modal */}
                  <div className="pt-3 border-t border-[#222] space-y-2.5">
                    
                    {/* Botão de Marcação/Verificação Rápida */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleAlternarStatus(previa.id, previa.status)}
                        className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                          isAveriguado
                            ? 'bg-emerald-500/10 hover:bg-red-500/10 text-emerald-400 hover:text-red-300 border-emerald-500/30 hover:border-red-500/30'
                            : 'bg-[#1a1a1a] hover:bg-emerald-500/10 text-gray-400 hover:text-emerald-400 border-[#333] hover:border-emerald-500/30'
                        }`}
                        title={isAveriguado ? 'Clique para reabrir averiguação' : 'Clique para marcar como averiguado'}
                      >
                        {isAveriguado ? (
                          <>
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Averiguado</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-gray-500 group-hover:text-emerald-400" />
                            <span>Marcar Averiguado</span>
                          </>
                        )}
                      </button>

                      {isAveriguado && previa.verificado_por_nome && (
                        <span className="text-[10px] text-emerald-400/80 truncate max-w-[150px] font-medium" title={previa.verificado_por_nome}>
                          Por {previa.verificado_por_nome}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#1f1f1f]">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <MessageSquare className={`w-4 h-4 ${previa.total_consideracoes > 0 ? 'text-[#facc15]' : 'text-gray-600'}`} />
                        <span className={`font-medium ${previa.total_consideracoes > 0 ? 'text-gray-200' : 'text-gray-500'}`}>
                          {previa.total_consideracoes === 0 
                            ? 'Sem pareceres' 
                            : `${previa.total_consideracoes} parecer${previa.total_consideracoes > 1 ? 'es' : ''}`}
                        </span>
                      </div>

                      <button
                        onClick={() => abrirModalConsideracoes(previa)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#facc15] text-gray-200 hover:text-black font-bold text-xs rounded-xl border border-[#333] hover:border-[#facc15] transition-all"
                      >
                        <span>Abrir Considerações</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Controles de Paginação */}
        {previasOrdenadas.length > 0 && totalPaginas > 1 && (
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs text-gray-400">
              Exibindo <b>{indexInicio + 1}</b> a <b>{Math.min(indexFim, previasOrdenadas.length)}</b> de <b>{previasOrdenadas.length}</b> documentos
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-1.5 rounded-lg border border-[#333] bg-[#171717] hover:bg-[#222] disabled:opacity-40 disabled:hover:bg-[#171717] text-gray-300 transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  onClick={() => setPaginaAtual(num)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                    paginaAtual === num
                      ? 'bg-[#facc15] text-black border-[#facc15] shadow-md shadow-[#facc15]/10'
                      : 'bg-[#171717] text-gray-300 border-[#333] hover:border-[#444] hover:bg-[#222]'
                  }`}
                >
                  {num}
                </button>
              ))}

              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="p-1.5 rounded-lg border border-[#333] bg-[#171717] hover:bg-[#222] disabled:opacity-40 disabled:hover:bg-[#171717] text-gray-300 transition-colors"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CONSIDERAÇÕES INCREMENTAIS */}
      {previaSelecionada && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2b2b2b] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-[#181818] border-b border-[#292929] flex items-start justify-between gap-4">
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
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
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
                  Candidato: <b>{previaSelecionada.candidato_nome}</b>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPdfPreviewModal(`${API_URL}/regional/${id}/admissoes/${previaSelecionada.id}/pdf`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-[#3d3d3d] transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-[#facc15]" />
                  Ver PDF
                </button>
                <button 
                  onClick={() => setPreviaSelecionada(null)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Barra de Status & Ação de Homologação/Verificação */}
              <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                previaSelecionada.status === 'AVERIGUADO'
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/5 border-amber-500/20 text-amber-300'
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
                      ? 'bg-[#181818] hover:bg-[#222] text-gray-300 border-[#383838]'
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

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#facc15]" />
                  Pareceres Registrados ({consideracoes.length})
                </h4>

                {carregandoConsideracoes ? (
                  <div className="py-8 text-center text-gray-500 flex items-center justify-center gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-[#facc15]" />
                    Carregando pareceres...
                  </div>
                ) : consideracoes.length === 0 ? (
                  <div className="p-6 bg-[#0c0c0c] border border-[#222] rounded-xl text-center text-gray-500 text-xs">
                    Nenhum parecer ou consideração foi registrado ainda para esta prévia.<br/>
                    Utilize o formulário abaixo para inserir o primeiro apontamento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consideracoes.map((c) => (
                      <div 
                        key={c.id}
                        className="bg-[#0f0f0f] border border-[#222] rounded-xl p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#facc15]/10 border border-[#facc15]/20 flex items-center justify-center text-[#facc15] text-xs font-bold">
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

              <form onSubmit={handleEnviarConsideracao} className="bg-[#171717] border border-[#282828] rounded-xl p-4 space-y-3">
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
                  className="w-full p-3 bg-[#0d0d0d] border border-[#333] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] transition-colors resize-none"
                  required
                />

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={enviandoConsideracao || !novaConsideracaoTexto.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-md transition-all"
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
          </div>
        </div>
      )}

      {/* MODAL DE PUBLICAÇÃO DE NOVA PRÉVIA */}
      {showNovaPreviaModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2b2b2b] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-[#181818] border-b border-[#292929] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#facc15]/10 text-[#facc15] rounded-lg">
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
                className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
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
                          ? 'bg-[#facc15] text-black border-[#facc15]' 
                          : 'bg-[#0d0d0d] text-gray-400 border-[#2a2a2a] hover:border-[#444]'
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
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15] cursor-pointer"
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
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Data Limite para Considerações (Opcional - padrão: 30 dias)
                </label>
                <input
                  type="date"
                  value={formPrevia.data_limite}
                  onChange={(e) => setFormPrevia(prev => ({ ...prev, data_limite: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Documento PDF da Prancha (Opcional)
                </label>
                <div className="border-2 border-dashed border-[#333] hover:border-[#444] rounded-xl p-4 text-center bg-[#0a0a0a] transition-colors">
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222]">
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
                  className="flex items-center gap-2 px-5 py-2 bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#333] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-3 bg-[#181818] border-b border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <FileText className="w-4 h-4 text-[#facc15]" />
                Visualização do Documento Oficial (PDF)
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`${pdfPreviewModal}?download=true`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#242424] hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-[#383838] transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-gray-400" />
                  Baixar Arquivo
                </a>
                <button
                  onClick={() => setPdfPreviewModal(null)}
                  className="p-1 text-gray-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#1a1a1a] p-1">
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
