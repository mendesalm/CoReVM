// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  Vote, ShieldCheck, Loader2, 
  Plus, Search, ArrowLeft, Calendar, Trash2, Send, CheckCircle2,
  Clock, X, CheckCheck,
  SlidersHorizontal, ChevronLeft, ChevronRight, BarChart3,
  AlertCircle, CheckSquare, Building2, Check
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface ApuracaoItem {
  opcao: string;
  votos: number;
  percentual: number;
}

interface VotoDetalhado {
  id: string;
  loja_id: string;
  loja_nome: string;
  loja_numero: string;
  autor_nome: string;
  autor_cargo: string;
  opcao_escolhida: string;
  justificativa?: string | null;
  data_voto: string;
}

interface VotacaoItem {
  id: string;
  regiao_id: string;
  titulo: string;
  descricao: string;
  tipo: string;
  tipo_label: string;
  status: string; // 'EM_ANDAMENTO' | 'ENCERRADA'
  opcoes: string[];
  data_abertura: string;
  data_encerramento: string | null;
  quorum_minimo: string;
  autor_nome: string;
  autor_cargo: string;
  total_votos: number;
  total_lojas_conselho: number;
  percentual_quorum: number;
  apuracao: ApuracaoItem[];
  minha_loja_votou: boolean;
  meu_voto: string | null;
  minha_loja_justificativa?: string | null;
  pode_gerenciar: boolean;
  votos_detalhados: VotoDetalhado[];
}

export default function PaginaVotacoes() {
  const { id } = useParams<{ id: string }>();
  const [votacoes, setVotacoes] = useState<VotacaoItem[]>([]);
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
  const [filtroTipo, setFiltroTipo] = useState<'TODAS' | 'DELIBERACAO' | 'CONSULTA'>('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'EM_ANDAMENTO' | 'ENCERRADA' | 'MINHA_PENDENTE'>('TODOS');
  const [ordenacao, setOrdenacao] = useState<'RECENTES' | 'PRAZO' | 'MAIS_VOTADAS' | 'PENDENTES_PRIMEIRO'>('RECENTES');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(6);

  // Modal de Votação e Apuração
  const [votacaoSelecionada, setVotacaoSelecionada] = useState<VotacaoItem | null>(null);
  const [opcaoVotoEscolhida, setOpcaoVotoEscolhida] = useState('');
  const [justificativaVoto, setJustificativaVoto] = useState('');
  const [enviandoVoto, setEnviandoVoto] = useState(false);

  // Modal de Criação de Nova Votação
  const [showNovaVotacaoModal, setShowNovaVotacaoModal] = useState(false);
  const [salvandoVotacao, setSalvandoVotacao] = useState(false);
  const [formVotacao, setFormVotacao] = useState({
    titulo: '',
    descricao: '',
    tipo: 'DELIBERACAO',
    opcoes: ['Favorável', 'Contrário', 'Abstenção'],
    data_encerramento: '',
    quorum_minimo: 'MAIORIA_SIMPLES'
  });
  const [novaOpcaoTexto, setNovaOpcaoTexto] = useState('');

  // Carregar Dados
  const carregarDados = async () => {
    setLoading(true);
    setErro('');
    const headers = { 'X-User-Id': activeUserId };

    try {
      try {
        const votacoesRes = await axios.get(`${API_URL}/regional/${id}/votacoes`, { headers });
        const items = Array.isArray(votacoesRes.data) ? votacoesRes.data : (votacoesRes.data?.votacoes || []);
        setVotacoes(items);
      } catch (errVotacoes: any) {
        console.error('Erro ao buscar votações:', errVotacoes);
        setErro(errVotacoes.response?.data?.detail || 'Não foi possível carregar as votações do conselho.');
      }

      // 2. Contexto do Usuário
      try {
        const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
        if (userRes.data) setUserContext(userRes.data);
      } catch (errUser) {
        console.warn('Contexto do usuário não pôde ser carregado:', errUser);
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

  // Abrir Modal de Voto / Apuração
  const abrirModalVoto = (votacao: VotacaoItem) => {
    setVotacaoSelecionada(votacao);
    setOpcaoVotoEscolhida(votacao.meu_voto || '');
    setJustificativaVoto(votacao.minha_loja_justificativa || '');
  };

  // Submeter Voto Formal
  const handleVotar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!votacaoSelecionada || !opcaoVotoEscolhida) return;

    setEnviandoVoto(true);
    try {
      await axios.post(
        `${API_URL}/regional/${id}/votacoes/${votacaoSelecionada.id}/votar`,
        {
          opcao_escolhida: opcaoVotoEscolhida,
          justificativa: justificativaVoto.trim() || null
        },
        { headers: { 'X-User-Id': activeUserId } }
      );

      // Recarregar votações e atualizar modal ativo
      const res = await axios.get(`${API_URL}/regional/${id}/votacoes`, {
        headers: { 'X-User-Id': activeUserId }
      });
      const listaAtualizada: VotacaoItem[] = res.data || [];
      setVotacoes(listaAtualizada);
      
      const atualizada = listaAtualizada.find(v => v.id === votacaoSelecionada.id);
      if (atualizada) {
        setVotacaoSelecionada(atualizada);
      }
    } catch (err: any) {
      alert('Erro ao registrar voto: ' + (err.response?.data?.detail || err.message));
    } finally {
      setEnviandoVoto(false);
    }
  };

  // Alternar Status (Encerrar / Reabrir Votação)
  const handleAlternarStatusVotacao = async (votacaoId: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'ENCERRADA' ? 'EM_ANDAMENTO' : 'ENCERRADA';
    const acaoLabel = novoStatus === 'ENCERRADA' ? 'encerrar' : 'reabrir';
    if (!confirm(`Deseja realmente ${acaoLabel} esta votação no Conselho?`)) return;

    try {
      await axios.put(
        `${API_URL}/regional/${id}/votacoes/${votacaoId}/status`,
        { status: novoStatus },
        { headers: { 'X-User-Id': activeUserId } }
      );
      
      setVotacoes(prev => prev.map(v => v.id === votacaoId ? { ...v, status: novoStatus } : v));
      if (votacaoSelecionada?.id === votacaoId) {
        setVotacaoSelecionada(prev => prev ? { ...prev, status: novoStatus } : null);
      }
    } catch (err: any) {
      alert('Erro ao alterar status: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Excluir Votação (Deleção Visual)
  const handleExcluirVotacao = async (votacaoId: string) => {
    if (!confirm('Deseja realmente ocultar esta deliberação do conselho?')) return;
    try {
      await axios.delete(`${API_URL}/regional/${id}/votacoes/${votacaoId}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      setVotacoes(prev => prev.filter(v => v.id !== votacaoId));
      if (votacaoSelecionada?.id === votacaoId) {
        setVotacaoSelecionada(null);
      }
    } catch (err: any) {
      alert('Erro ao excluir votação: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Submeter Nova Votação
  const handleSalvarNovaVotacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVotacao.titulo.trim()) {
      alert('Informe o título da deliberação.');
      return;
    }
    if (formVotacao.opcoes.length < 2) {
      alert('Adicione pelo menos 2 opções de voto.');
      return;
    }

    setSalvandoVotacao(true);
    try {
      await axios.post(
        `${API_URL}/regional/${id}/votacoes`,
        {
          titulo: formVotacao.titulo.trim(),
          descricao: formVotacao.descricao.trim(),
          tipo: formVotacao.tipo,
          opcoes: formVotacao.opcoes,
          data_encerramento: formVotacao.data_encerramento || null,
          quorum_minimo: formVotacao.quorum_minimo
        },
        { headers: { 'X-User-Id': activeUserId } }
      );

      setShowNovaVotacaoModal(false);
      setFormVotacao({
        titulo: '',
        descricao: '',
        tipo: 'DELIBERACAO',
        opcoes: ['Favorável', 'Contrário', 'Abstenção'],
        data_encerramento: '',
        quorum_minimo: 'MAIORIA_SIMPLES'
      });
      carregarDados();
    } catch (err: any) {
      alert('Erro ao abrir votação: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSalvandoVotacao(false);
    }
  };

  // Adicionar Opção Customizada ao Formulário
  const handleAdicionarOpcao = () => {
    if (!novaOpcaoTexto.trim()) return;
    if (formVotacao.opcoes.includes(novaOpcaoTexto.trim())) {
      alert('Esta opção já existe.');
      return;
    }
    setFormVotacao(prev => ({
      ...prev,
      opcoes: [...prev.opcoes, novaOpcaoTexto.trim()]
    }));
    setNovaOpcaoTexto('');
  };

  // Remover Opção
  const handleRemoverOpcao = (indice: number) => {
    if (formVotacao.opcoes.length <= 2) {
      alert('Uma votação deve possuir no mínimo 2 opções.');
      return;
    }
    setFormVotacao(prev => ({
      ...prev,
      opcoes: prev.opcoes.filter((_, i) => i !== indice)
    }));
  };

  // 1. Filtragem
  const votacoesFiltradas = votacoes.filter(v => {
    const atendeTipo = filtroTipo === 'TODAS' || v.tipo.toUpperCase() === filtroTipo;
    let atendeStatus = true;
    if (filtroStatus === 'EM_ANDAMENTO') atendeStatus = v.status === 'EM_ANDAMENTO';
    if (filtroStatus === 'ENCERRADA') atendeStatus = v.status === 'ENCERRADA';
    if (filtroStatus === 'MINHA_PENDENTE') atendeStatus = v.status === 'EM_ANDAMENTO' && !v.minha_loja_votou;
    
    const termo = busca.toLowerCase();
    const atendeBusca = 
      v.titulo.toLowerCase().includes(termo) ||
      v.descricao.toLowerCase().includes(termo) ||
      v.tipo_label.toLowerCase().includes(termo);

    return atendeTipo && atendeStatus && atendeBusca;
  });

  // 2. Ordenação
  const votacoesOrdenadas = [...votacoesFiltradas].sort((a, b) => {
    if (ordenacao === 'PRAZO') {
      const dataA = a.data_encerramento || '9999-12-31';
      const dataB = b.data_encerramento || '9999-12-31';
      return dataA.localeCompare(dataB);
    }
    if (ordenacao === 'MAIS_VOTADAS') {
      return b.total_votos - a.total_votos;
    }
    if (ordenacao === 'PENDENTES_PRIMEIRO') {
      if (a.minha_loja_votou !== b.minha_loja_votou) {
        return a.minha_loja_votou ? 1 : -1;
      }
    }
    return b.data_abertura.localeCompare(a.data_abertura);
  });

  // 3. Paginação
  const totalPaginas = Math.ceil(votacoesOrdenadas.length / itensPorPagina) || 1;
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const indexFim = itensPorPagina === 9999 ? votacoesOrdenadas.length : indexInicio + itensPorPagina;
  const votacoesPaginadas = itensPorPagina === 9999 ? votacoesOrdenadas : votacoesOrdenadas.slice(indexInicio, indexFim);

  // Métricas
  const totalEmAndamento = votacoes.filter(v => v.status === 'EM_ANDAMENTO').length;
  const totalEncerradas = votacoes.filter(v => v.status === 'ENCERRADA').length;
  const totalMinhasVotadas = votacoes.filter(v => v.minha_loja_votou).length;
  const totalMinhasPendentes = votacoes.filter(v => v.status === 'EM_ANDAMENTO' && !v.minha_loja_votou).length;

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

  if (loading && votacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#facc15]" />
        <span className="text-sm">Carregando Enquetes e Votações...</span>
      </div>
    );
  }

  if (erro && votacoes.length === 0) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center p-6 text-gray-200">
        <div className="max-w-md w-full p-8 text-center bg-[#141414] border border-[#2b2b2b] rounded-2xl shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-[#facc15]">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Acesso ao Módulo de Votações</h2>
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
              <Vote className="w-6 h-6"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-wide">
                  Enquetes e Votações
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20">
                  {votacoes.length} cadastradas
                </span>
                {totalEmAndamento > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {totalEmAndamento} ativas
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Consultas oficiais e deliberações plenárias do Conselho Regional
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
              onClick={() => setShowNovaVotacaoModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs rounded-xl shadow-lg shadow-[#facc15]/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Nova Deliberação / Enquete
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-6">
        
        {/* Painel de Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Total de Consultas</span>
              <span className="text-xl font-black text-white">{votacoes.length}</span>
            </div>
            <div className="p-2 bg-[#facc15]/10 text-[#facc15] rounded-lg">
              <Vote className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Em Votação (Ativas)</span>
              <span className="text-xl font-black text-emerald-400">{totalEmAndamento}</span>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Encerradas / Apuradas</span>
              <span className="text-xl font-black text-blue-400">{totalEncerradas}</span>
            </div>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <CheckCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121212] border border-[#222] rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-400 block mb-0.5">Votos da Minha Loja</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-[#facc15]">{totalMinhasVotadas}</span>
                <span className="text-[11px] text-gray-500 font-semibold">/ {totalMinhasPendentes} pendente(s)</span>
              </div>
            </div>
            <div className="p-2 bg-[#facc15]/10 text-[#facc15] rounded-lg">
              <CheckSquare className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Barra de Filtros por Modalidade & Status */}
        <div className="bg-[#121212] border border-[#222] rounded-2xl p-4 space-y-3">
          
          {/* Linha 1: Abas por Natureza */}
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
                Todas ({votacoes.length})
              </button>
              <button
                onClick={() => setFiltroTipo('DELIBERACAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'DELIBERACAO' 
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Deliberações Formais
              </button>
              <button
                onClick={() => setFiltroTipo('CONSULTA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroTipo === 'CONSULTA' 
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/10' 
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                }`}
              >
                Consultas Regionais
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative min-w-[260px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text"
                placeholder="Buscar deliberação por título ou tema..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#0c0c0c] border border-[#2b2b2b] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] transition-colors"
              />
            </div>
          </div>

          {/* Linha 2: Filtro por Status + Ordenação + Itens por Página */}
          <div className="pt-2 border-t border-[#1e1e1e] flex flex-wrap items-center justify-between gap-3 text-xs">
            
            <div className="flex items-center gap-1 bg-[#0a0a0a] border border-[#222] p-1 rounded-xl">
              <button
                onClick={() => setFiltroStatus('TODOS')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filtroStatus === 'TODOS' 
                    ? 'bg-[#252525] text-white shadow' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFiltroStatus('EM_ANDAMENTO')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  filtroStatus === 'EM_ANDAMENTO' 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'text-gray-400 hover:text-emerald-300'
                }`}
              >
                <Clock className="w-3 h-3 text-emerald-400" />
                Em Aberto ({totalEmAndamento})
              </button>
              <button
                onClick={() => setFiltroStatus('ENCERRADA')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  filtroStatus === 'ENCERRADA' 
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                    : 'text-gray-400 hover:text-blue-300'
                }`}
              >
                <CheckCheck className="w-3 h-3 text-blue-400" />
                Encerradas ({totalEncerradas})
              </button>
              <button
                onClick={() => setFiltroStatus('MINHA_PENDENTE')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  filtroStatus === 'MINHA_PENDENTE' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'text-gray-400 hover:text-amber-300'
                }`}
              >
                <AlertCircle className="w-3 h-3 text-amber-400" />
                Minha Loja Pendente ({totalMinhasPendentes})
              </button>
            </div>

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
                  <option value="PRAZO">Prazo de Encerramento</option>
                  <option value="MAIS_VOTADAS">Mais Votadas</option>
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

        {/* Grid de Cards de Votação */}
        {votacoesOrdenadas.length === 0 ? (
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-gray-400">
            <Vote className="w-12 h-12 mx-auto mb-3 text-gray-600 stroke-[1.5]" />
            <h3 className="text-base font-bold text-gray-300 mb-1">Nenhuma deliberação encontrada</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Não há consultas correspondentes aos filtros aplicados. Clique em "Nova Deliberação / Enquete" para iniciar uma votação regional.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {votacoesPaginadas.map((votacao) => {
              const isAberta = votacao.status === 'EM_ANDAMENTO';
              const minhaLojaVotou = votacao.minha_loja_votou;

              return (
                <div
                  key={votacao.id}
                  className={`border rounded-2xl p-5 shadow-xl transition-all duration-200 flex flex-col justify-between group ${
                    minhaLojaVotou
                      ? 'bg-gradient-to-b from-emerald-950/15 via-[#131414] to-[#141414] border-emerald-500/30 hover:border-emerald-500/50'
                      : isAberta
                      ? 'bg-[#141414] border-[#292929] hover:border-[#3d3d3d]'
                      : 'bg-[#101010] border-[#222] opacity-90'
                  }`}
                >
                  <div>
                    {/* Cabeçalho do Card */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider ${
                          votacao.tipo === 'DELIBERACAO'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}>
                          {votacao.tipo_label}
                        </span>

                        {isAberta ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Em Votação
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border tracking-wider bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1">
                            Encerrada
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        <span>{formatarData(votacao.data_abertura)}</span>

                        {votacao.pode_gerenciar && (
                          <button
                            onClick={() => handleExcluirVotacao(votacao.id)}
                            className="p-1 text-gray-500 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors ml-1"
                            title="Ocultar esta votação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Título da Votação */}
                    <h2 className="text-sm font-bold text-white leading-snug group-hover:text-[#facc15] transition-colors mb-2">
                      {votacao.titulo}
                    </h2>

                    {/* Descrição resumida */}
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-3.5">
                      {votacao.descricao}
                    </p>

                    {/* Selo de Voto da Loja */}
                    <div className="mb-4">
                      {minhaLojaVotou ? (
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2">
                          <CheckCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <div className="overflow-hidden">
                            <span className="text-[10px] uppercase font-bold text-emerald-400/80 block">Voto Formal da sua Loja</span>
                            <span className="text-xs font-black text-emerald-300 truncate block">
                              {votacao.meu_voto}
                            </span>
                          </div>
                        </div>
                      ) : isAberta ? (
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
                          <div>
                            <span className="text-[10px] uppercase font-bold text-amber-400/80 block">Atenção ao Quórum</span>
                            <span className="text-xs font-bold text-amber-300 block">
                              Sua Loja ainda não registrou o voto
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 bg-[#171717] border border-[#282828] rounded-xl text-center text-[11px] text-gray-400">
                          Votação finalizada
                        </div>
                      )}
                    </div>

                    {/* Barra de Progresso / Quórum das Lojas */}
                    <div className="bg-[#0e0e0e] border border-[#242424] rounded-xl p-3 mb-4 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 font-semibold flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#facc15]" />
                          Quórum de Lojas:
                        </span>
                        <span className="font-bold text-white">
                          {votacao.total_votos} de {votacao.total_lojas_conselho} lojas ({votacao.percentual_quorum}%)
                        </span>
                      </div>
                      
                      <div className="w-full bg-[#202020] h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-[#facc15] to-emerald-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, votacao.percentual_quorum)}%` }}
                        />
                      </div>

                      {/* Mini Apuração das Opções */}
                      {votacao.total_votos > 0 && (
                        <div className="pt-2 border-t border-[#1f1f1f] space-y-1.5">
                          {votacao.apuracao.slice(0, 3).map((ap) => (
                            <div key={ap.opcao} className="flex items-center justify-between text-[10px] text-gray-300">
                              <span className="truncate max-w-[170px]">{ap.opcao}</span>
                              <span className="font-bold text-[#facc15]">{ap.percentual}% ({ap.votos})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-3 border-t border-[#222] space-y-2">
                    
                    {/* Botões de Ação */}
                    <div className="flex items-center justify-between gap-2">
                      {votacao.pode_gerenciar && (
                        <button
                          onClick={() => handleAlternarStatusVotacao(votacao.id, votacao.status)}
                          className="text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
                        >
                          {isAberta ? 'Encerrar Votação' : 'Reabrir Votação'}
                        </button>
                      )}

                      <button
                        onClick={() => abrirModalVoto(votacao)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 font-bold text-xs rounded-xl border transition-all ml-auto ${
                          !minhaLojaVotou && isAberta
                            ? 'bg-[#facc15] hover:bg-[#eab308] text-black border-[#facc15] shadow-md shadow-[#facc15]/10'
                            : 'bg-[#1c1c1c] hover:bg-[#252525] text-gray-200 border-[#333]'
                        }`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>{!minhaLojaVotou && isAberta ? 'Votar Agora' : 'Ver Apuração'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Controles de Paginação */}
        {votacoesOrdenadas.length > 0 && totalPaginas > 1 && (
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs text-gray-400">
              Exibindo <b>{indexInicio + 1}</b> a <b>{Math.min(indexFim, votacoesOrdenadas.length)}</b> de <b>{votacoesOrdenadas.length}</b> consultas
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-1.5 rounded-lg border border-[#333] bg-[#171717] hover:bg-[#222] disabled:opacity-40 disabled:hover:bg-[#171717] text-gray-300 transition-colors"
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
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL DE VOTAÇÃO INTERATIVA & APURAÇÃO EM TEMPO REAL      */}
      {/* ========================================================= */}
      {votacaoSelecionada && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2b2b2b] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            {/* Header do Modal */}
            <div className="px-6 py-4 bg-[#181818] border-b border-[#292929] flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                    votacaoSelecionada.tipo === 'DELIBERACAO'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  }`}>
                    {votacaoSelecionada.tipo_label}
                  </span>

                  {votacaoSelecionada.status === 'EM_ANDAMENTO' ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Em Andamento
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
                      Encerrada
                    </span>
                  )}

                  <span className="text-xs text-gray-400">
                    Aberta em {formatarData(votacaoSelecionada.data_abertura)}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white">
                  {votacaoSelecionada.titulo}
                </h3>
              </div>

              <button 
                onClick={() => setVotacaoSelecionada(null)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Descrição e Fundamentação */}
              <div className="p-4 bg-[#171717] border border-[#262626] rounded-xl text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Fundamentação da Consulta</span>
                {votacaoSelecionada.descricao}
              </div>

              {/* Seção 1: Formulário de Votação (Se aberta) */}
              {votacaoSelecionada.status === 'EM_ANDAMENTO' && (
                <form onSubmit={handleVotar} className="bg-[#141414] border border-[#2b2b2b] rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Vote className="w-4 h-4 text-[#facc15]" />
                      Registro do Voto Formal da sua Loja
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Representante: <b className="text-[#facc15]">{userContext.role}</b>
                    </span>
                  </div>

                  {/* Opções de Voto */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {votacaoSelecionada.opcoes.map((opcao) => {
                      const selecionada = opcaoVotoEscolhida === opcao;
                      return (
                        <button
                          key={opcao}
                          type="button"
                          onClick={() => setOpcaoVotoEscolhida(opcao)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between gap-2 text-left ${
                            selecionada
                              ? 'bg-[#facc15] text-black border-[#facc15] shadow-lg shadow-[#facc15]/20'
                              : 'bg-[#0d0d0d] text-gray-200 border-[#2f2f2f] hover:border-[#444] hover:bg-[#161616]'
                          }`}
                        >
                          <span>{opcao}</span>
                          {selecionada && <Check className="w-4 h-4 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Justificativa de Voto Opcional */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                      Justificativa do Voto da Loja (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={justificativaVoto}
                      onChange={(e) => setJustificativaVoto(e.target.value)}
                      placeholder="Manifestação resumida do quadro sobre a decisão..."
                      className="w-full p-2.5 bg-[#0a0a0a] border border-[#2b2b2b] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] transition-colors resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-500">
                      * Cada Loja tem direito a 1 voto formal no Conselho Regional.
                    </span>

                    <button
                      type="submit"
                      disabled={enviandoVoto || !opcaoVotoEscolhida}
                      className="flex items-center gap-2 px-5 py-2 bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-md transition-all"
                    >
                      {enviandoVoto ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Gravando Voto...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          {votacaoSelecionada.minha_loja_votou ? 'Atualizar Voto da Loja' : 'Confirmar Voto Formal'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Seção 2: Apuração em Tempo Real */}
              <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    Apuração dos Resultados
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {votacaoSelecionada.total_votos} de {votacaoSelecionada.total_lojas_conselho} Lojas ({votacaoSelecionada.percentual_quorum}%)
                  </span>
                </div>

                <div className="space-y-3">
                  {votacaoSelecionada.apuracao.map((ap) => (
                    <div key={ap.opcao} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-200">{ap.opcao}</span>
                        <span className="font-bold text-[#facc15]">
                          {ap.percentual}% <span className="text-gray-500 font-normal">({ap.votos} voto{ap.votos !== 1 ? 's' : ''})</span>
                        </span>
                      </div>
                      <div className="w-full bg-[#0a0a0a] h-3 rounded-full overflow-hidden border border-[#222]">
                        <div 
                          className="bg-gradient-to-r from-amber-500 to-[#facc15] h-full rounded-full transition-all duration-500"
                          style={{ width: `${ap.percentual}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção 3: Lista de Lojas Votantes */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#facc15]" />
                  Lojas que já Manifestaram Voto ({votacaoSelecionada.votos_detalhados.length})
                </h4>

                {votacaoSelecionada.votos_detalhados.length === 0 ? (
                  <div className="p-6 bg-[#0a0a0a] border border-[#222] rounded-xl text-center text-gray-500 text-xs">
                    Nenhuma Loja registrou voto ainda nesta deliberação.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {votacaoSelecionada.votos_detalhados.map((v) => (
                      <div 
                        key={v.id}
                        className="bg-[#0e0e0e] border border-[#222] rounded-xl p-3 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block">
                            {v.loja_nome} {v.loja_numero ? `nº ${v.loja_numero}` : ''}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            Votado por: {v.autor_nome} ({v.autor_cargo}) • {formatarDataHora(v.data_voto)}
                          </span>
                          {v.justificativa && (
                            <p className="text-[11px] text-gray-300 italic pt-1">
                              "{v.justificativa}"
                            </p>
                          )}
                        </div>

                        <span className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20 flex-shrink-0">
                          {v.opcao_escolhida}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE CRIAÇÃO DE NOVA VOTAÇÃO                          */}
      {/* ========================================================= */}
      {showNovaVotacaoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2b2b2b] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-[#181818] border-b border-[#292929] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#facc15]/10 text-[#facc15] rounded-lg">
                  <Vote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Abrir Nova Votação / Deliberação
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Consulta democrática para decisão das Lojas Jurisdicionadas
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNovaVotacaoModal(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaVotacao} className="p-6 space-y-4">
              
              {/* Tipo da Consulta */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Natureza da Votação *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormVotacao(prev => ({ ...prev, tipo: 'DELIBERACAO' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      formVotacao.tipo === 'DELIBERACAO'
                        ? 'bg-[#facc15] text-black border-[#facc15]'
                        : 'bg-[#0d0d0d] text-gray-400 border-[#2a2a2a] hover:border-[#444]'
                    }`}
                  >
                    Deliberação Formal (Oficial)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormVotacao(prev => ({ ...prev, tipo: 'CONSULTA' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      formVotacao.tipo === 'CONSULTA'
                        ? 'bg-[#facc15] text-black border-[#facc15]'
                        : 'bg-[#0d0d0d] text-gray-400 border-[#2a2a2a] hover:border-[#444]'
                    }`}
                  >
                    Consulta Regional (Sondagem)
                  </button>
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Título da Deliberação *
                </label>
                <input
                  type="text"
                  value={formVotacao.titulo}
                  onChange={(e) => setFormVotacao(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ex: Aprovação do Calendário de Eventos Conjuntos"
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
                  required
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Descrição e Fundamentação *
                </label>
                <textarea
                  rows={3}
                  value={formVotacao.descricao}
                  onChange={(e) => setFormVotacao(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Explique detalhadamente o objetivo, antecedentes e o que está sendo deliberado..."
                  className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15] resize-none"
                  required
                />
              </div>

              {/* Opções de Voto */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Opções de Resposta (Mínimo 2) *
                </label>
                <div className="space-y-1.5 mb-2">
                  {formVotacao.opcoes.map((opcao, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs text-gray-500 font-bold">{idx + 1}.</span>
                      <span className="flex-1 px-3 py-1.5 bg-[#0a0a0a] border border-[#262626] rounded-lg text-xs text-white">
                        {opcao}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverOpcao(idx)}
                        className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Remover opção"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={novaOpcaoTexto}
                    onChange={(e) => setNovaOpcaoTexto(e.target.value)}
                    placeholder="Digitar nova opção..."
                    className="flex-1 px-3 py-1.5 bg-[#0d0d0d] border border-[#2e2e2e] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#facc15]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAdicionarOpcao();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAdicionarOpcao}
                    className="px-3 py-1.5 bg-[#222] hover:bg-[#333] text-gray-200 text-xs font-semibold rounded-lg border border-[#383838] transition-colors"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>

              {/* Prazo de Encerramento e Quórum */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Data Limite (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formVotacao.data_encerramento}
                    onChange={(e) => setFormVotacao(prev => ({ ...prev, data_encerramento: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Quórum Requerido
                  </label>
                  <select
                    value={formVotacao.quorum_minimo}
                    onChange={(e) => setFormVotacao(prev => ({ ...prev, quorum_minimo: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#2e2e2e] rounded-xl text-xs text-white focus:outline-none focus:border-[#facc15] cursor-pointer"
                  >
                    <option value="MAIORIA_SIMPLES">Maioria Simples (50% + 1)</option>
                    <option value="MAIORIA_QUALIFICADA_2_3">Maioria Qualificada (2/3)</option>
                    <option value="UNANIMIDADE">Unanimidade (100%)</option>
                  </select>
                </div>
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222]">
                <button
                  type="button"
                  onClick={() => setShowNovaVotacaoModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoVotacao}
                  className="flex items-center gap-2 px-5 py-2 bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  {salvandoVotacao ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Abrir Votação
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
