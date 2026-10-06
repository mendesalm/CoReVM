import React, { useState, useEffect } from 'react';
import { clienteHttp, API_URL } from '../../../compartilhado/contextos/AuthContext';
import { CampoData } from '../../../compartilhado/componentes/SeletorDataHora';
import { useParams, Link } from 'react-router-dom';
import { 
  Vote, ShieldCheck, Loader2, 
  Plus, Search, ArrowLeft, Calendar, Trash2, Send, CheckCircle2,
  Clock, X, CheckCheck,
  SlidersHorizontal, ChevronLeft, ChevronRight, BarChart3,
  AlertCircle, CheckSquare, Building2, Check, Edit2, Save
} from 'lucide-react';

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
  status: string;
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
  
  const [userContext, setUserContext] = useState<any>({
    usuario_id: '',
    role: '',
    is_diretoria: false,
    loja_id: null
  });

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODAS' | 'DELIBERACAO' | 'CONSULTA'>('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'EM_ANDAMENTO' | 'ENCERRADA' | 'MINHA_PENDENTE'>('TODOS');
  const [ordenacao, setOrdenacao] = useState<'RECENTES' | 'PRAZO' | 'MAIS_VOTADAS' | 'PENDENTES_PRIMEIRO'>('RECENTES');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(10);

  const [votacaoSelecionada, setVotacaoSelecionada] = useState<VotacaoItem | null>(null);
  const [opcaoVotoEscolhida, setOpcaoVotoEscolhida] = useState('');
  const [justificativaVoto, setJustificativaVoto] = useState('');
  const [enviandoVoto, setEnviandoVoto] = useState(false);

  const [isEditando, setIsEditando] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [formEdicao, setFormEdicao] = useState({
    titulo: '',
    descricao: '',
    data_encerramento: '',
    quorum_minimo: ''
  });

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

  const carregarDados = async () => {
    setLoading(true);
    setErro('');

    try {
      try {
        const votacoesRes = await clienteHttp.get(`${API_URL}/regional/${id}/votacoes`);
        const items = Array.isArray(votacoesRes.data) ? votacoesRes.data : (votacoesRes.data?.votacoes || []);
        setVotacoes(items);
      } catch (errVotacoes: any) {
        console.error('Erro ao buscar votações:', errVotacoes);
        setErro(extrairMensagemErro(errVotacoes, 'Não foi possível carregar as votações do conselho.'));
      }

      try {
        const userRes = await clienteHttp.get(`${API_URL}/regional/${id}/me`);
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
  }, [id]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, filtroTipo, filtroStatus, ordenacao, itensPorPagina]);

  const abrirModalVoto = (votacao: VotacaoItem) => {
    setVotacaoSelecionada(votacao);
    setOpcaoVotoEscolhida(votacao.meu_voto || '');
    setJustificativaVoto(votacao.minha_loja_justificativa || '');
    setIsEditando(false);
    setFormEdicao({
      titulo: votacao.titulo,
      descricao: votacao.descricao,
      data_encerramento: votacao.data_encerramento || '',
      quorum_minimo: votacao.quorum_minimo
    });
  };

  const handleVotar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!votacaoSelecionada || !opcaoVotoEscolhida) return;

    setEnviandoVoto(true);
    try {
      await clienteHttp.post(
        `${API_URL}/regional/${id}/votacoes/${votacaoSelecionada.id}/votar`,
        {
          opcao_escolhida: opcaoVotoEscolhida,
          justificativa: justificativaVoto.trim() || null
        }
      );

      const res = await clienteHttp.get(`${API_URL}/regional/${id}/votacoes`);
      const listaAtualizada: VotacaoItem[] = Array.isArray(res.data) ? res.data : [];
      setVotacoes(listaAtualizada);
      
      const atualizada = listaAtualizada.find(v => v.id === votacaoSelecionada.id);
      if (atualizada) {
        setVotacaoSelecionada(atualizada);
      }
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao registrar voto'));
    } finally {
      setEnviandoVoto(false);
    }
  };

  const handleAlternarStatusVotacao = async (votacaoId: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'ENCERRADA' ? 'EM_ANDAMENTO' : 'ENCERRADA';
    const acaoLabel = novoStatus === 'ENCERRADA' ? 'encerrar' : 'reabrir';
    if (!confirm(`Deseja realmente ${acaoLabel} esta votação no Conselho?`)) return;

    try {
      await clienteHttp.put(
        `${API_URL}/regional/${id}/votacoes/${votacaoId}/status`,
        { status: novoStatus }
      );
      
      setVotacoes(prev => prev.map(v => v.id === votacaoId ? { ...v, status: novoStatus } : v));
      if (votacaoSelecionada?.id === votacaoId) {
        setVotacaoSelecionada(prev => prev ? { ...prev, status: novoStatus } : null);
      }
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao alterar status'));
    }
  };

  const handleExcluirVotacao = async (votacaoId: string) => {
    if (!confirm('Deseja realmente ocultar esta deliberação do conselho?')) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/votacoes/${votacaoId}`);
      setVotacoes(prev => prev.filter(v => v.id !== votacaoId));
      if (votacaoSelecionada?.id === votacaoId) {
        setVotacaoSelecionada(null);
      }
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao excluir votação'));
    }
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!votacaoSelecionada) return;
    if (!formEdicao.titulo.trim()) {
      alert('Informe o título da deliberação.');
      return;
    }

    setSalvandoEdicao(true);
    try {
      await clienteHttp.put(
        `${API_URL}/regional/${id}/votacoes/${votacaoSelecionada.id}`,
        {
          titulo: formEdicao.titulo.trim(),
          descricao: formEdicao.descricao.trim(),
          data_encerramento: formEdicao.data_encerramento || null,
          quorum_minimo: formEdicao.quorum_minimo
        }
      );

      const res = await clienteHttp.get(`${API_URL}/regional/${id}/votacoes`);
      const listaAtualizada: VotacaoItem[] = Array.isArray(res.data) ? res.data : [];
      setVotacoes(listaAtualizada);
      
      const atualizada = listaAtualizada.find(v => v.id === votacaoSelecionada.id);
      if (atualizada) {
        setVotacaoSelecionada(atualizada);
      }
      setIsEditando(false);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao editar votação'));
    } finally {
      setSalvandoEdicao(false);
    }
  };

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
      await clienteHttp.post(
        `${API_URL}/regional/${id}/votacoes`,
        {
          titulo: formVotacao.titulo.trim(),
          descricao: formVotacao.descricao.trim(),
          tipo: formVotacao.tipo,
          opcoes: formVotacao.opcoes,
          data_encerramento: formVotacao.data_encerramento || null,
          quorum_minimo: formVotacao.quorum_minimo
        }
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
      alert(extrairMensagemErro(err, 'Erro ao abrir votação'));
    } finally {
      setSalvandoVotacao(false);
    }
  };

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

  const votacoesFiltradas = votacoes.filter(v => {
    const atendeTipo = filtroTipo === 'TODAS' || v.tipo.toUpperCase() === filtroTipo;
    let atendeStatus = true;
    if (filtroStatus === 'EM_ANDAMENTO') atendeStatus = v.status === 'EM_ANDAMENTO';
    if (filtroStatus === 'ENCERRADA') atendeStatus = v.status === 'ENCERRADA';
    if (filtroStatus === 'MINHA_PENDENTE') atendeStatus = v.status === 'EM_ANDAMENTO' && !v.minha_loja_votou;
    
    const termo = busca.toLowerCase();
    const atendeBusca = 
      (v.titulo || "").toLowerCase().includes(termo) ||
      (v.descricao || "").toLowerCase().includes(termo) ||
      (v.tipo_label || "").toLowerCase().includes(termo);

    return atendeTipo && atendeStatus && atendeBusca;
  });

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

  const totalPaginas = Math.ceil(votacoesOrdenadas.length / itensPorPagina) || 1;
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const indexFim = itensPorPagina === 9999 ? votacoesOrdenadas.length : indexInicio + itensPorPagina;
  const votacoesPaginadas = itensPorPagina === 9999 ? votacoesOrdenadas : votacoesOrdenadas.slice(indexInicio, indexFim);

  const totalEmAndamento = votacoes.filter(v => v.status === 'EM_ANDAMENTO').length;
  const totalEncerradas = votacoes.filter(v => v.status === 'ENCERRADA').length;

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
        <span className="text-sm">Carregando Enquetes e Votações...</span>
      </div>
    );
  }

  if (erro && votacoes.length === 0) {
    return (
      <div className="min-h-screen bg-[#070e1c] flex items-center justify-center p-6 text-slate-200">
        <div className="max-w-md w-full p-8 text-center bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto bg-slate-800 border border-slate-600 rounded-2xl flex items-center justify-center text-slate-300">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Acesso ao Módulo de Votações</h2>
            <p className="text-xs text-slate-400">{erro}</p>
          </div>

          <button
            onClick={() => carregarDados()}
            className="w-full py-2.5 bg-slate-600 text-white hover:bg-slate-500 font-bold text-xs rounded-xl transition-all shadow-md"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070e1c] text-slate-200 p-4 lg:p-8">
      
              {/* 1. CABEÇALHO */}
        <div className="max-w-7xl mx-auto mb-8">
          <div className="bg-slate-800 border border-[#242424] rounded-2xl overflow-hidden mb-6">
            <div className="px-4 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link to={`/regiao/${id}`} className="p-1.5 text-[#888] hover:text-white hover:bg-slate-700 rounded-lg transition-colors mr-1" title="Voltar ao Painel Geral">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-400/20">
                  <Vote className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">Enquetes e Votações</h1>
                  <p className="text-xs text-[#888] mt-0.5 line-clamp-1">Consultas oficiais e deliberações do Conselho</p>
                </div>
              </div>
              <button
                onClick={() => setShowNovaVotacaoModal(true)}
                className="flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600 font-bold text-xs p-2.5 sm:px-4 sm:py-2.5 rounded-xl shadow-md transition-all shrink-0"
                title="Nova Enquete"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" /> <span className="hidden sm:inline">Nova Enquete</span>
              </button>
            </div>
          </div>

          {/* 4. BARRA DE FERRAMENTAS */}
          <div className="my-6 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar deliberação ou enquete..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-800 border border-[#242424] rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-[#666] focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value as any)}
                  className="flex-1 sm:flex-none bg-slate-800 border border-[#242424] text-xs text-[#ddd] rounded-xl px-2 py-2.5 focus:border-blue-400 focus:outline-none cursor-pointer"
                >
                  <option value="TODAS">Todos os Status</option>
                  <option value="EM_ANDAMENTO">Em Andamento</option>
                  <option value="MINHA_PENDENTE">Pendentes (Minha Loja)</option>
                  <option value="ENCERRADA">Encerradas</option>
                </select>

                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value as any)}
                  className="flex-1 sm:flex-none bg-slate-800 border border-[#242424] text-xs text-[#ddd] rounded-xl px-2 py-2.5 focus:border-blue-400 focus:outline-none cursor-pointer"
                >
                  <option value="TODAS">Todos os Tipos</option>
                  <option value="DELIBERACAO">Deliberação</option>
                  <option value="ENQUETE">Enquete</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mb-12 space-y-6">
        
        {votacoesOrdenadas.length === 0 ? (
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-12 text-center text-slate-400">
            <Vote className="w-12 h-12 mx-auto mb-3 text-slate-500 stroke-[1.5]" />
            <h3 className="text-base font-bold text-slate-200 mb-1">Nenhuma deliberação encontrada</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Não há consultas correspondentes aos filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Cabecalho Lista (Desktop) */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-6">Nome da Enquete / Votação</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-3 text-right">Quórum / Participação</div>
            </div>

            {/* Itens */}
            {votacoesPaginadas.map((votacao) => {
              const isAberta = votacao.status === 'EM_ANDAMENTO';
              
              return (
                <div
                  key={votacao.id}
                  onClick={() => abrirModalVoto(votacao)}
                  className="bg-[#1e293b] border border-slate-700 hover:border-slate-500 rounded-xl p-4 cursor-pointer transition-colors flex flex-col md:grid md:grid-cols-12 md:items-center gap-4 group"
                >
                  <div className="md:col-span-6 flex flex-col gap-1">
                    <h3 className="text-sm font-bold text-white group-hover:text-slate-300 transition-colors line-clamp-1">
                      {votacao.titulo}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                        votacao.tipo === 'DELIBERACAO' 
                          ? 'bg-slate-700 text-slate-300' 
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {votacao.tipo_label}
                      </span>
                      <span>Criada em {formatarData(votacao.data_abertura)}</span>
                    </div>
                  </div>

                  <div className="md:col-span-3 flex items-center">
                    {isAberta ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Em Votação
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-700 text-slate-300 text-xs font-bold">
                        Encerrado
                      </span>
                    )}
                  </div>

                  <div className="md:col-span-3 flex flex-col items-start md:items-end gap-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                      <span>{votacao.percentual_quorum}%</span>
                      <span className="text-slate-500 font-normal">({votacao.total_votos}/{votacao.total_lojas_conselho})</span>
                    </div>
                    <div className="w-full md:w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-slate-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, votacao.percentual_quorum)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {votacoesOrdenadas.length > 0 && totalPaginas > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 px-2">
            <span className="text-sm text-slate-400">
              Página {paginaAtual} de {totalPaginas}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-2 rounded-lg bg-[#1e293b] border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="p-2 rounded-lg bg-[#1e293b] border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* MODAL / DRAWER DE VOTAÇÃO */}
      {votacaoSelecionada && (
        <div className="fixed inset-0 z-50 bg-[#070e1c]/80 backdrop-blur-sm flex justify-end">
          <div className="absolute inset-0" onClick={() => setVotacaoSelecionada(null)}></div>
          <div className="relative w-full max-w-lg bg-[#1e293b] h-full shadow-2xl flex flex-col border-l border-slate-700 animate-in slide-in-from-right duration-300 overflow-hidden">
            
            <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {votacaoSelecionada.tipo_label}
                  </span>
                  {votacaoSelecionada.status === 'EM_ANDAMENTO' ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      Em Andamento
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                      Encerrada
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {formatarData(votacaoSelecionada.data_abertura)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  {votacaoSelecionada.titulo}
                </h3>
              </div>

              <button 
                onClick={() => setVotacaoSelecionada(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Edição / Detalhes */}
              {isEditando ? (
                <form onSubmit={handleSalvarEdicao} className="space-y-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-white mb-2">Editar Votação</h4>
                  
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Título</label>
                    <input
                      type="text"
                      value={formEdicao.titulo}
                      onChange={e => setFormEdicao({...formEdicao, titulo: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-slate-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Descrição</label>
                    <textarea
                      rows={3}
                      value={formEdicao.descricao}
                      onChange={e => setFormEdicao({...formEdicao, descricao: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-slate-500 outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Encerramento</label>
                      <CampoData
                        value={formEdicao.data_encerramento}
                        onChange={v => setFormEdicao({...formEdicao, data_encerramento: v})}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Quórum</label>
                      <select
                        value={formEdicao.quorum_minimo}
                        onChange={e => setFormEdicao({...formEdicao, quorum_minimo: e.target.value})}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white outline-none cursor-pointer"
                      >
                        <option value="MAIORIA_SIMPLES">Maioria Simples</option>
                        <option value="MAIORIA_QUALIFICADA_2_3">Maioria Qualificada (2/3)</option>
                        <option value="UNANIMIDADE">Unanimidade (100%)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setIsEditando(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                      Cancelar
                    </button>
                    <button type="submit" disabled={salvandoEdicao} className="flex items-center gap-1 px-4 py-1.5 bg-slate-600 text-white font-bold text-xs rounded-lg hover:bg-slate-500 transition-colors">
                      {salvandoEdicao ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                      Salvar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 leading-relaxed whitespace-pre-wrap relative group">
                  {votacaoSelecionada.pode_gerenciar && (
                    <button 
                      onClick={() => setIsEditando(true)}
                      className="absolute top-2 right-2 p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="Editar informações"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Fundamentação da Consulta</span>
                  {votacaoSelecionada.descricao}
                </div>
              )}

              {/* Votar (Se Aberta) */}
              {votacaoSelecionada.status === 'EM_ANDAMENTO' && (
                <form onSubmit={handleVotar} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Vote className="w-4 h-4 text-slate-400" />
                      Registro de Voto
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {votacaoSelecionada.opcoes.map((opcao) => {
                      const selecionada = opcaoVotoEscolhida === opcao;
                      return (
                        <button
                          key={opcao}
                          type="button"
                          onClick={() => setOpcaoVotoEscolhida(opcao)}
                          className={`p-3 rounded-xl border text-sm font-bold transition-all flex items-center justify-between gap-2 text-left ${
                            selecionada
                              ? 'bg-slate-600 text-white border-slate-500'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <span>{opcao}</span>
                          {selecionada && <Check className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Justificativa (Opcional)</label>
                    <textarea
                      rows={2}
                      value={justificativaVoto}
                      onChange={(e) => setJustificativaVoto(e.target.value)}
                      placeholder="Manifestação..."
                      className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white outline-none focus:border-slate-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={enviandoVoto || !opcaoVotoEscolhida}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50 font-bold text-sm rounded-xl transition-all"
                    >
                      {enviandoVoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Confirmar Voto
                    </button>
                  </div>
                </form>
              )}

              {/* Apuração */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    Resultados Parciais / Finais
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    {votacaoSelecionada.percentual_quorum}%
                  </span>
                </div>

                <div className="space-y-3">
                  {votacaoSelecionada.apuracao.map((ap) => (
                    <div key={ap.opcao} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{ap.opcao}</span>
                        <span className="font-bold text-slate-300">
                          {ap.percentual}% <span className="font-normal text-slate-400">({ap.votos})</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-700">
                        <div 
                          className="bg-slate-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${ap.percentual}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lojas Votantes */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Votos Registrados ({votacaoSelecionada.votos_detalhados.length})
                </h4>

                {votacaoSelecionada.votos_detalhados.length === 0 ? (
                  <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl text-center text-slate-400 text-sm">
                    Nenhum voto registrado.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {votacaoSelecionada.votos_detalhados.map((v) => (
                      <div 
                        key={v.id}
                        className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block">
                            {v.loja_nome}
                          </span>
                          <span className="text-xs text-slate-400">
                            {v.autor_nome} • {formatarDataHora(v.data_voto)}
                          </span>
                          {v.justificativa && (
                            <p className="text-xs text-slate-300 italic pt-1">
                              "{v.justificativa}"
                            </p>
                          )}
                        </div>

                        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 font-bold text-xs">
                          {v.opcao_escolhida}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {votacaoSelecionada.pode_gerenciar && (
                <div className="flex gap-2 justify-end pt-4 border-t border-slate-700">
                  <button
                    onClick={() => handleExcluirVotacao(votacaoSelecionada.id)}
                    className="px-4 py-2 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => handleAlternarStatusVotacao(votacaoSelecionada.id, votacaoSelecionada.status)}
                    className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {votacaoSelecionada.status === 'EM_ANDAMENTO' ? 'Encerrar Votação' : 'Reabrir Votação'}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA VOTAÇÃO */}
      {showNovaVotacaoModal && (
        <div className="fixed inset-0 z-50 bg-[#070e1c]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Nova Enquete / Deliberação</h3>
              <button onClick={() => setShowNovaVotacaoModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaVotacao} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-300 block mb-1">Natureza</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFormVotacao(prev => ({ ...prev, tipo: 'DELIBERACAO' }))} className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${formVotacao.tipo === 'DELIBERACAO' ? 'bg-slate-600 text-white border-slate-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>Deliberação Formal</button>
                  <button type="button" onClick={() => setFormVotacao(prev => ({ ...prev, tipo: 'CONSULTA' }))} className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${formVotacao.tipo === 'CONSULTA' ? 'bg-slate-600 text-white border-slate-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>Consulta Regional</button>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-300 block mb-1">Título</label>
                <input type="text" value={formVotacao.titulo} onChange={e => setFormVotacao(prev => ({ ...prev, titulo: e.target.value }))} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500" required />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-300 block mb-1">Descrição</label>
                <textarea rows={3} value={formVotacao.descricao} onChange={e => setFormVotacao(prev => ({ ...prev, descricao: e.target.value }))} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500 resize-none" required />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-300 block mb-1">Opções de Resposta</label>
                <div className="space-y-2 mb-2">
                  {formVotacao.opcoes.map((opcao, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white">{opcao}</span>
                      <button type="button" onClick={() => handleRemoverOpcao(idx)} className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="text" value={novaOpcaoTexto} onChange={e => setNovaOpcaoTexto(e.target.value)} placeholder="Nova opção..." className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdicionarOpcao(); } }} />
                  <button type="button" onClick={handleAdicionarOpcao} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors">Adicionar</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-300 block mb-1">Data Limite (Opcional)</label>
                  <CampoData value={formVotacao.data_encerramento} onChange={v => setFormVotacao(prev => ({ ...prev, data_encerramento: v }))} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-300 block mb-1">Quórum</label>
                  <select value={formVotacao.quorum_minimo} onChange={e => setFormVotacao(prev => ({ ...prev, quorum_minimo: e.target.value }))} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-slate-500 cursor-pointer">
                    <option value="MAIORIA_SIMPLES">Maioria Simples (50% + 1)</option>
                    <option value="MAIORIA_QUALIFICADA_2_3">Maioria Qualificada (2/3)</option>
                    <option value="UNANIMIDADE">Unanimidade (100%)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={() => setShowNovaVotacaoModal(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={salvandoVotacao} className="flex items-center gap-2 px-5 py-2 bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50 font-bold text-sm rounded-xl transition-all">
                  {salvandoVotacao ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Abrir Votação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
