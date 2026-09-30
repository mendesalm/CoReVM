// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { clienteHttp, API_URL } from '../../../compartilhado/contextos/AuthContext';
import { CampoData } from '../../../compartilhado/componentes/SeletorDataHora';
import {
  Landmark, Loader2, Plus, Search, ArrowLeft,
  CheckCircle2, Clock, X, HeartHandshake,
  FileCheck, AlertCircle,
  ChevronLeft, ChevronRight, Check,
  Armchair, Activity, Radio
} from 'lucide-react';

function extrairMensagemErro(err: any, mensagemPadrao: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d?.msg || JSON.stringify(d)).join('; ');
  }
  return err?.message || mensagemPadrao;
}

interface ItemPatrimonio {
  id: string;
  regiao_id: string;
  codigo_tombamento: string;
  nome: string;
  descricao?: string | null;
  categoria: string;
  tipo_propriedade: string; // 'CONSELHO' | 'LOJA'
  loja_proprietaria_id?: string | null;
  loja_proprietaria_nome?: string | null;
  loja_proprietaria_numero?: string | null;
  quantidade_total: number;
  quantidade_disponivel: number;
  quantidade_emprestada: number;
  localizacao_fisica?: string | null;
  estado_conservacao: string;
  permite_emprestimo: boolean;
  permite_locacao: boolean;
  taxa_locacao_estimada?: string | null;
  foto_url?: string | null;
  data_cadastro: string;
  fila_espera_count: number;
  emprestimos_ativos_count: number;
  minha_loja_tem_emprestimo: boolean;
  minha_loja_na_fila: boolean;
  pode_gerenciar: boolean;
}

interface EmprestimoItem {
  id: string;
  item_id: string;
  item_nome: string;
  item_codigo: string;
  item_categoria: string;
  loja_solicitante_id: string;
  loja_solicitante_nome: string;
  loja_solicitante_numero: string;
  beneficiario_final: string;
  responsavel_retirada_nome: string;
  responsavel_retirada_cargo?: string | null;
  responsavel_retirada_contato?: string | null;
  responsavel_entrega_nome: string;
  responsavel_entrega_cargo?: string | null;
  data_retirada: string;
  data_prevista_devolucao: string;
  data_efetiva_devolucao?: string | null;
  quantidade: number;
  status: string; // 'ATIVO' | 'ATRASADO' | 'CONCLUIDO'
  dias_restantes: number;
  atrasado: boolean;
  estado_conservacao_entrega: string;
  estado_conservacao_devolucao?: string | null;
  observacoes?: string | null;
  pode_gerenciar: boolean;
}

interface FilaItem {
  id: string;
  item_id: string;
  item_nome: string;
  item_categoria: string;
  item_disponivel_agora: number;
  posicao: number;
  loja_solicitante_id: string;
  loja_solicitante_nome: string;
  loja_solicitante_numero: string;
  responsavel_nome: string;
  contato?: string | null;
  grau_urgencia: string; // 'NORMAL' | 'ALTA' | 'URGENTE'
  status: string;
  observacoes?: string | null;
  data_solicitacao: string;
}

interface EstatisticasPatrimonio {
  total_ativos: number;
  total_disponiveis: number;
  total_emprestimos_ativos: number;
  total_atrasados: number;
  itens_lojas_solidarias: number;
  fila_espera_total: number;
}

export default function PaginaPatrimonio() {
  const { id } = useParams<{ id: string }>();
  const [itens, setItens] = useState<ItemPatrimonio[]>([]);
  const [emprestimos, setEmprestimos] = useState<EmprestimoItem[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasPatrimonio>({
    total_ativos: 0,
    total_disponiveis: 0,
    total_emprestimos_ativos: 0,
    total_atrasados: 0,
    itens_lojas_solidarias: 0,
    fila_espera_total: 0
  });

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Master-Detail: Item Selecionado para a Ficha/Drawer
  const [itemSelecionado, setItemSelecionado] = useState<ItemPatrimonio | null>(null);

  // Controle de Usuário e RBAC
  const [userContext, setUserContext] = useState<any>({
    usuario_id: '',
    role: '',
    is_diretoria: false,
    loja_id: null
  });

  // Filtros do Catálogo
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [propriedadeFiltro, setPropriedadeFiltro] = useState('TODOS');
  const [apenasDisponiveis, setApenasDisponiveis] = useState(false);
  const [busca, setBusca] = useState('');

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 6;

  // Modais de Ação
  const [modalEmprestimoAberto, setModalEmprestimoAberto] = useState(false);
  const [itemParaEmprestimo, setItemParaEmprestimo] = useState<ItemPatrimonio | null>(null);

  const [modalDevolucaoAberto, setModalDevolucaoAberto] = useState(false);
  const [cautelaParaDevolucao, setCautelaParaDevolucao] = useState<EmprestimoItem | null>(null);

  const [modalFilaAberto, setModalFilaAberto] = useState(false);
  const [itemParaFila, setItemParaFila] = useState<ItemPatrimonio | null>(null);

  const [modalNovoItemAberto, setModalNovoItemAberto] = useState(false);
  const [modalTermoAberto, setModalTermoAberto] = useState(false);
  const [cautelaSelecionadaTermo, setCautelaSelecionadaTermo] = useState<EmprestimoItem | null>(null);

  // Formulários
  const [formEmprestimo, setFormEmprestimo] = useState({
    loja_solicitante_id: 'LOJA_ESTRELA_ANAPOLIS_42',
    loja_solicitante_nome: 'ARLS Estrela de Anápolis',
    loja_solicitante_numero: '42',
    beneficiario_final: '',
    responsavel_retirada_nome: '',
    responsavel_retirada_cargo: 'Venerável Mestre',
    responsavel_retirada_contato: '',
    responsavel_entrega_nome: 'Ir.'.concat(' Marcos Vinícius Ferreira'),
    responsavel_entrega_cargo: 'Secretário Regional',
    data_retirada: new Date().toISOString().split('T')[0],
    data_prevista_devolucao: '',
    quantidade: 1,
    estado_conservacao_entrega: 'OTIMO',
    observacoes: ''
  });

  const [formDevolucao, setFormDevolucao] = useState({
    data_efetiva_devolucao: new Date().toISOString().split('T')[0],
    estado_conservacao_devolucao: 'BOM',
    observacoes: ''
  });

  const [formFila, setFormFila] = useState({
    loja_solicitante_id: 'LOJA_ESTRELA_ANAPOLIS_42',
    loja_solicitante_nome: 'ARLS Estrela de Anápolis',
    loja_solicitante_numero: '42',
    responsavel_nome: '',
    contato: '',
    grau_urgencia: 'NORMAL',
    observacoes: ''
  });

  const [formNovoItem, setFormNovoItem] = useState({
    codigo_tombamento: '',
    nome: '',
    descricao: '',
    categoria: 'HOSPITALAR',
    tipo_propriedade: 'CONSELHO',
    loja_proprietaria_id: '',
    loja_proprietaria_nome: '',
    loja_proprietaria_numero: '',
    quantidade_total: 1,
    localizacao_fisica: '',
    estado_conservacao: 'BOM',
    permite_emprestimo: true,
    permite_locacao: false,
    taxa_locacao_estimada: ''
  });

  // Carregamento de Dados
  const carregarDados = async () => {
    setLoading(true);
    setErro('');

    try {
      try {
        const statsRes = await clienteHttp.get(`${API_URL}/regional/${id}/patrimonio/estatisticas`);
        if (statsRes.data) setEstatisticas(statsRes.data);
      } catch (errStats) {
        console.warn('Erro ao carregar estatísticas:', errStats);
      }

      try {
        const itensRes = await clienteHttp.get(`${API_URL}/regional/${id}/patrimonio/itens`, {
          params: {
            categoria: categoriaFiltro,
            tipo_propriedade: propriedadeFiltro,
            apenas_disponiveis: apenasDisponiveis,
            busca: busca || undefined
          }
        });
        setItens(Array.isArray(itensRes.data) ? itensRes.data : []);
      } catch (errItens) {
        console.error('Erro ao carregar itens:', errItens);
        setErro(extrairMensagemErro(errItens, 'Não foi possível carregar o inventário de bens.'));
      }

      try {
        const empRes = await clienteHttp.get(`${API_URL}/regional/${id}/patrimonio/emprestimos`);
        setEmprestimos(Array.isArray(empRes.data) ? empRes.data : []);
      } catch (errEmp) {
        console.warn('Erro ao carregar cautelas:', errEmp);
      }

      try {
        const filaRes = await clienteHttp.get(`${API_URL}/regional/${id}/patrimonio/fila`);
        setFila(Array.isArray(filaRes.data) ? filaRes.data : []);
      } catch (errFila) {
        console.warn('Erro ao carregar fila:', errFila);
      }

      try {
        const userRes = await clienteHttp.get(`${API_URL}/regional/${id}/me`);
        if (userRes.data) setUserContext(userRes.data);
      } catch (errUser) {
        console.warn('Erro ao carregar contexto de usuário:', errUser);
      }

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
    setPaginaAtual(1);
  }, [id, categoriaFiltro, propriedadeFiltro, apenasDisponiveis, busca]);

  // Submissão: Solicitar Empréstimo
  const handleConfirmarEmprestimo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemParaEmprestimo) return;

    try {
      await clienteHttp.post(
        `${API_URL}/regional/${id}/patrimonio/itens/${itemParaEmprestimo.id}/emprestar`,
        formEmprestimo
      );
      setSucesso(`Termo de Cautela emitido com sucesso para ${itemParaEmprestimo.nome}!`);
      setModalEmprestimoAberto(false);
      carregarDados();
      // Atualiza o item selecionado se o drawer estiver aberto
      if (itemSelecionado?.id === itemParaEmprestimo.id) {
         const itemAtualizado = itens.find(i => i.id === itemParaEmprestimo.id);
         if (itemAtualizado) {
            setItemSelecionado({...itemAtualizado, quantidade_disponivel: itemAtualizado.quantidade_disponivel - formEmprestimo.quantidade});
         }
      }
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao emitir termo de empréstimo.'));
    }
  };

  // Submissão: Devolução
  const handleConfirmarDevolucao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cautelaParaDevolucao) return;

    try {
      const res = await clienteHttp.post(
        `${API_URL}/regional/${id}/patrimonio/emprestimos/${cautelaParaDevolucao.id}/devolver`,
        formDevolucao
      );
      setModalDevolucaoAberto(false);
      if (res.data.aviso_fila) {
        alert(`${res.data.message}\n\n${res.data.aviso_fila}`);
      } else {
        setSucesso(res.data.message || 'Devolução registrada com sucesso!');
      }
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao registrar devolução.'));
    }
  };

  // Submissão: Fila de Espera
  const handleConfirmarFila = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemParaFila) return;

    try {
      const res = await clienteHttp.post(
        `${API_URL}/regional/${id}/patrimonio/itens/${itemParaFila.id}/fila`,
        formFila
      );
      setSucesso(res.data.message || 'Demanda inserida na fila de espera com sucesso!');
      setModalFilaAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao ingressar na fila de espera.'));
    }
  };

  // Submissão: Cadastro de Novo Bem
  const handleConfirmarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await clienteHttp.post(`${API_URL}/regional/${id}/patrimonio/itens`, formNovoItem);
      setSucesso('Bem patrimonial cadastrado com sucesso no acervo regional!');
      setModalNovoItemAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao cadastrar bem patrimonial.'));
    }
  };

  // Exclusão / Baixa
  const handleExcluirItem = async (itemId: string, nome: string) => {
    if (!confirm(`Confirma a baixa/ocultação do bem "${nome}" do patrimônio?`)) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/patrimonio/itens/${itemId}`);
      setSucesso('Item patrimonial baixado com sucesso.');
      if (itemSelecionado?.id === itemId) setItemSelecionado(null);
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao excluir item.'));
    }
  };

  // Cancelar Fila
  const handleCancelarFila = async (filaId: string) => {
    if (!confirm('Deseja retirar esta solicitação da fila de espera?')) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/patrimonio/fila/${filaId}`);
      setSucesso('Solicitação removida da fila de espera.');
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao cancelar fila.'));
    }
  };

  // Paginação dos itens no Catálogo
  const totalPaginas = Math.ceil(itens.length / itensPorPagina) || 1;
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const itensPaginados = itens.slice(indexInicio, indexInicio + itensPorPagina);

  const getIconeCategoria = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'HOSPITALAR': return HeartHandshake;
      case 'MOBILIARIO': return Armchair;
      case 'AUDIOVISUAL': return Radio;
      case 'LITURGICO': return Landmark;
      default: return Landmark;
    }
  };

  return (
    <div className="min-h-screen bg-sigma-bg text-gray-200">
      
      {/* Sub-Header Contextual */}
      <div className="bg-sigma-surface border-b border-sigma-border">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/regiao/${id}`}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-sigma-elevated rounded-lg transition-colors mr-1"
              title="Voltar ao Painel Geral"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15] border border-[#facc15]/20">
              <Landmark className="w-5 h-5"/>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide uppercase">Patrimônio</h1>
              <p className="text-xs text-gray-400 mt-0.5">Catálogo Unificado e Gestão de Ativos</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setFormNovoItem({
                  codigo_tombamento: '',
                  nome: '',
                  descricao: '',
                  categoria: 'HOSPITALAR',
                  tipo_propriedade: userContext.is_diretoria ? 'CONSELHO' : 'LOJA',
                  loja_proprietaria_id: userContext.loja_id || '',
                  loja_proprietaria_nome: '',
                  loja_proprietaria_numero: '',
                  quantidade_total: 1,
                  localizacao_fisica: '',
                  estado_conservacao: 'BOM',
                  permite_emprestimo: true,
                  permite_locacao: false,
                  taxa_locacao_estimada: ''
                });
                setModalNovoItemAberto(true);
              }}
              className="flex items-center gap-2 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> Cadastrar Bem
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-6">

        {/* ALERTA DE SUCESSO / ERRO */}
        {sucesso && (
          <div className="mt-4 p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {sucesso}
            </span>
            <button onClick={() => setSucesso('')}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {erro && (
          <div className="mt-4 p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-400" /> {erro}
            </span>
            <button onClick={() => setErro('')}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* 1. DASHBOARD DE ESTATÍSTICAS */}
        <div className="hidden lg:grid lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-sigma-surface border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#facc15]" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Acervo Total</span>
              <Landmark className="w-5 h-5 text-[#facc15] opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_ativos}</span>
              <span className="text-xs text-emerald-400 font-semibold">{estatisticas.total_disponiveis} disponíveis</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Bens catalogados no Conselho Regional</p>
          </div>

          <div className="bg-sigma-surface border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Cautelas Ativas</span>
              <Activity className="w-5 h-5 text-blue-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_emprestimos_ativos}</span>
              {estatisticas.total_atrasados > 0 && (
                <span className="text-xs text-red-400 font-bold animate-pulse">
                  ({estatisticas.total_atrasados} em atraso)
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#666] mt-2">Equipamentos em cessão fraterna</p>
          </div>

          <div className="bg-sigma-surface border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Rede Solidária</span>
              <HeartHandshake className="w-5 h-5 text-emerald-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.itens_lojas_solidarias}</span>
              <span className="text-xs text-emerald-400 font-semibold">Itens de Lojas</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Disponibilizados por Lojas parceiras</p>
          </div>

          <div className="bg-sigma-surface border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Fila de Espera</span>
              <Clock className="w-5 h-5 text-amber-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.fila_espera_total}</span>
              <span className="text-xs text-amber-400 font-semibold">Demandas</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Aguardando devolução/liberação</p>
          </div>
        </div>

        {/* 2. CATÁLOGO UNIFICADO */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-white mb-4">Catálogo de Ativos</h2>
          {/* Filtros e Busca */}
          <div className="bg-sigma-surface border border-[#242424] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar cadeira de rodas, muletas..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#666] focus:border-[#facc15] focus:outline-none"
                />
              </div>

              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className="bg-sigma-elevated border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
              >
                <option value="TODAS">Todas as Categorias</option>
                <option value="HOSPITALAR">🏥 Hospitalar & Beneficência</option>
                <option value="MOBILIARIO">🪑 Mobiliário & Ágapes</option>
                <option value="AUDIOVISUAL">📻 Audiovisual & Som</option>
                <option value="LITURGICO">🏛️ Litúrgico & Templo</option>
              </select>

              <select
                value={propriedadeFiltro}
                onChange={(e) => setPropriedadeFiltro(e.target.value)}
                className="bg-sigma-elevated border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
              >
                <option value="TODOS">Todas as Origens</option>
                <option value="CONSELHO">Acervo do Conselho</option>
                <option value="LOJA">Rede Solidária (Lojas)</option>
              </select>

              <label className="flex items-center gap-2 text-xs text-[#aaa] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={apenasDisponiveis}
                  onChange={(e) => setApenasDisponiveis(e.target.checked)}
                  className="rounded border-sigma-border text-[#facc15] focus:ring-0 bg-sigma-elevated"
                />
                Apenas com Disponibilidade Imediata
              </label>
            </div>

            <div className="text-xs text-[#777]">
              Mostrando <span className="text-white font-bold">{itens.length}</span> ativos
            </div>
          </div>

          {/* Grid de Cards do Catálogo */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#888]">
              <Loader2 className="w-8 h-8 text-[#facc15] animate-spin mb-3" />
              <span className="text-xs">Consultando disponibilidade no acervo regional...</span>
            </div>
          ) : itens.length === 0 ? (
            <div className="bg-sigma-surface border border-sigma-border rounded-2xl p-12 text-center text-[#777]">
              <Landmark className="w-12 h-12 text-[#444] mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Nenhum bem patrimonial localizado</h3>
              <p className="text-xs max-w-md mx-auto">
                Ajuste os filtros de busca ou cadastre novos ativos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {itensPaginados.map((item) => {
                const IconeCat = getIconeCategoria(item.categoria);
                const estaDisponivel = item.quantidade_disponivel > 0;
                const isLoja = item.tipo_propriedade === 'LOJA';

                return (
                  <div
                    key={item.id}
                    onClick={() => setItemSelecionado(item)}
                    className={`bg-sigma-surface border rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 hover:border-[#4a4a4a] hover:-translate-y-1 cursor-pointer shadow-xl relative ${
                      isLoja ? 'border-emerald-500/20' : 'border-[#242424]'
                    }`}
                  >
                    <div>
                      {/* Topo do Card: Origem + Código de Tombamento */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        {isLoja ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <HeartHandshake className="w-3 h-3 text-emerald-400" />
                            Loja {item.loja_proprietaria_numero}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#facc15]/10 border border-[#facc15]/20 text-[#facc15] rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <Landmark className="w-3 h-3" />
                            Conselho Regional
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-[#777] bg-sigma-elevated px-2 py-0.5 rounded border border-sigma-border">
                          {item.codigo_tombamento}
                        </span>
                      </div>

                      {/* Título & Descrição */}
                      <h3 className="text-base font-bold text-white leading-snug mb-2 flex items-start gap-2.5">
                        <div className={`p-2 rounded-xl border mt-0.5 shrink-0 ${
                          isLoja 
                            ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400' 
                            : 'bg-sigma-elevated border-[#2c2c2c] text-[#facc15]'
                        }`}>
                          <IconeCat className="w-4 h-4" />
                        </div>
                        <span className="line-clamp-2">{item.nome}</span>
                      </h3>

                      <div className="flex items-center justify-between text-[11px] text-[#888] mb-4">
                        <span>Categoria: <strong className="text-[#bbb]">{item.categoria}</strong></span>
                      </div>

                      {/* Barra de Disponibilidade */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-[#777] font-medium">Status:</span>
                          <span className={`font-bold ${estaDisponivel ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {estaDisponivel ? 'Disponível' : 'Emprestado'} ({item.quantidade_disponivel}/{item.quantidade_total})
                          </span>
                        </div>
                        <div className="w-full bg-[#202020] h-2 rounded-full overflow-hidden flex">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              estaDisponivel ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${(item.quantidade_disponivel / item.quantidade_total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-sigma-border text-center text-[11px] text-[#888] font-semibold uppercase hover:text-white transition-colors">
                      Ver Ficha Completa
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-8 border-t border-sigma-border pt-4 text-xs text-[#888]">
              <span>Página {paginaAtual} de {totalPaginas}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={paginaAtual <= 1}
                  onClick={() => setPaginaAtual(p => p - 1)}
                  className="p-2 bg-sigma-surface border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPaginaAtual(p => p + 1)}
                  className="p-2 bg-sigma-surface border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DRAWER: FICHA DO ATIVO (MASTER-DETAIL) */}
      {/* ========================================================================= */}
      {itemSelecionado && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-sigma-bg/60 backdrop-blur-sm">
          {/* Overlay click para fechar */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setItemSelecionado(null)} />
          
          <div className="bg-sigma-surface border-l border-[#242424] w-full max-w-xl h-full shadow-2xl relative z-50 flex flex-col transform transition-transform duration-300 translate-x-0 overflow-hidden">
            {/* Cabecalho Drawer */}
            <div className="p-6 border-b border-[#242424] flex items-start justify-between bg-[#161616]">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-[#777] bg-sigma-elevated px-2 py-0.5 rounded border border-sigma-border">
                    Cód: {itemSelecionado.codigo_tombamento}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                    itemSelecionado.quantidade_disponivel > 0
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                  }`}>
                    {itemSelecionado.quantidade_disponivel > 0 ? 'Disponível' : 'Emprestado'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">{itemSelecionado.nome}</h2>
              </div>
              <button onClick={() => setItemSelecionado(null)} className="p-2 text-[#888] hover:text-white bg-sigma-elevated rounded-lg border border-sigma-border">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo Drawer (Scroll) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Secão: Detalhes Técnicos */}
              <section className="bg-[#161616] border border-[#242424] rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[#facc15]" /> Detalhes do Tombamento
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-[#666] mb-1">Categoria:</span>
                    <strong className="text-[#ddd]">{itemSelecionado.categoria}</strong>
                  </div>
                  <div>
                    <span className="block text-[#666] mb-1">Propriedade:</span>
                    <strong className="text-[#ddd]">
                      {itemSelecionado.tipo_propriedade === 'LOJA' 
                        ? `Loja ${itemSelecionado.loja_proprietaria_numero}` 
                        : 'Conselho Regional'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[#666] mb-1">Estado de Conservação:</span>
                    <strong className="text-emerald-400">{itemSelecionado.estado_conservacao}</strong>
                  </div>
                  <div>
                    <span className="block text-[#666] mb-1">Localização Física:</span>
                    <strong className="text-[#ddd] truncate" title={itemSelecionado.localizacao_fisica || 'Sede Regional'}>
                      {itemSelecionado.localizacao_fisica || 'Sede Regional'}
                    </strong>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[#666] mb-1">Descrição:</span>
                    <p className="text-[#aaa] leading-relaxed">
                      {itemSelecionado.descricao || 'Sem descrição adicional cadastrada.'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Seção: Cautelas Ativas Deste Item */}
              <section>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" /> Cautelas Ativas
                </h3>
                
                {(() => {
                  const cautelasItem = emprestimos.filter(e => e.item_id === itemSelecionado.id && (e.status === 'ATIVO' || e.status === 'ATRASADO'));
                  
                  if (cautelasItem.length === 0) {
                    return (
                      <div className="bg-[#161616] border border-[#242424] border-dashed rounded-xl p-4 text-center text-xs text-[#777]">
                        Nenhuma cautela ativa para este item no momento.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {cautelasItem.map(emp => (
                        <div key={emp.id} className={`bg-[#161616] border p-4 rounded-xl flex flex-col gap-3 ${
                          emp.atrasado ? 'border-red-500/40 bg-red-950/10' : 'border-[#2a2a2a]'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{emp.loja_solicitante_nome}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              emp.atrasado ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {emp.atrasado ? `Vencido (${Math.abs(emp.dias_restantes)} dias)` : `Faltam ${emp.dias_restantes} dias`}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-[#888]">
                            <div><span className="text-[#666]">Retirou:</span> <span className="text-[#ddd]">{emp.responsavel_retirada_nome}</span></div>
                            <div><span className="text-[#666]">Devolução Prevista:</span> <span className={emp.atrasado ? 'text-red-400' : 'text-[#ddd]'}>{emp.data_prevista_devolucao}</span></div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sigma-border">
                            <button
                              onClick={() => {
                                setCautelaSelecionadaTermo(emp);
                                setModalTermoAberto(true);
                              }}
                              className="px-2 py-1.5 bg-sigma-elevated hover:bg-sigma-elevated border border-[#303030] text-[10px] text-[#ddd] rounded-lg transition-all"
                            >
                              Ver Termo
                            </button>
                            {(emp.pode_gerenciar || userContext.is_diretoria) && (
                              <button
                                onClick={() => {
                                  setCautelaParaDevolucao(emp);
                                  setFormDevolucao({
                                    data_efetiva_devolucao: new Date().toISOString().split('T')[0],
                                    estado_conservacao_devolucao: 'BOM',
                                    observacoes: ''
                                  });
                                  setModalDevolucaoAberto(true);
                                }}
                                className="px-2 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[10px] rounded-lg transition-all"
                              >
                                Registrar Devolução
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>

              {/* Seção: Fila de Espera Deste Item */}
              <section>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" /> Fila de Espera
                </h3>
                
                {(() => {
                  const filaItem = fila.filter(f => f.item_id === itemSelecionado.id);
                  
                  if (filaItem.length === 0) {
                    return (
                      <div className="bg-[#161616] border border-[#242424] border-dashed rounded-xl p-4 text-center text-xs text-[#777]">
                        Fila vazia para este item.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filaItem.map(f => (
                        <div key={f.id} className="bg-[#161616] border border-[#2a2a2a] p-4 rounded-xl flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center shrink-0">
                              {f.posicao}º
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white mb-0.5">{f.loja_solicitante_nome}</div>
                              <div className="text-[10px] text-[#888]">Contato: {f.responsavel_nome}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelarFila(f.id)}
                            className="px-2 py-1.5 bg-sigma-elevated hover:bg-red-950/40 border border-[#303030] hover:text-red-400 text-[10px] text-[#777] rounded-lg transition-all"
                          >
                            Cancelar
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>

            </div>

            {/* Rodapé de Ações do Drawer */}
            <div className="p-6 border-t border-[#242424] bg-[#161616] flex flex-col gap-3">
              {itemSelecionado.quantidade_disponivel > 0 ? (
                <button
                  onClick={() => {
                    setItemParaEmprestimo(itemSelecionado);
                    setFormEmprestimo({
                      loja_solicitante_id: userContext.loja_id || 'LOJA_ESTRELA_ANAPOLIS_42',
                      loja_solicitante_nome: 'ARLS Estrela de Anápolis',
                      loja_solicitante_numero: '42',
                      beneficiario_final: '',
                      responsavel_retirada_nome: '',
                      responsavel_retirada_cargo: 'Venerável Mestre',
                      responsavel_retirada_contato: '',
                      responsavel_entrega_nome: 'Ir.'.concat(' Marcos Vinícius Ferreira'),
                      responsavel_entrega_cargo: 'Secretário Regional',
                      data_retirada: new Date().toISOString().split('T')[0],
                      data_prevista_devolucao: '',
                      quantidade: 1,
                      estado_conservacao_entrega: itemSelecionado.estado_conservacao,
                      observacoes: ''
                    });
                    setModalEmprestimoAberto(true);
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Solicitar Empréstimo
                </button>
              ) : (
                <button
                  onClick={() => {
                    setItemParaFila(itemSelecionado);
                    setFormFila({
                      loja_solicitante_id: userContext.loja_id || 'LOJA_ESTRELA_ANAPOLIS_42',
                      loja_solicitante_nome: 'ARLS Estrela de Anápolis',
                      loja_solicitante_numero: '42',
                      responsavel_nome: '',
                      contato: '',
                      grau_urgencia: 'NORMAL',
                      observacoes: ''
                    });
                    setModalFilaAberto(true);
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Clock className="w-5 h-5" /> Entrar na Fila
                </button>
              )}

              {itemSelecionado.pode_gerenciar && (
                <button
                  onClick={() => handleExcluirItem(itemSelecionado.id, itemSelecionado.nome)}
                  className="w-full py-2 text-xs text-[#666] hover:text-red-400 transition-colors uppercase font-bold tracking-wider"
                >
                  Excluir Ativo do Acervo
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SOLICITAR EMPRÉSTIMO / CAUTELA */}
      {/* ========================================================================= */}
      {modalEmprestimoAberto && itemParaEmprestimo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sigma-bg/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Termo de Cautela e Empréstimo</h3>
                  <p className="text-xs text-[#888]">Cessão fraterna de ativo para Loja Jurisdicionada</p>
                </div>
              </div>
              <button onClick={() => setModalEmprestimoAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarEmprestimo} className="p-6 space-y-4">
              <div className="bg-sigma-elevated p-3 rounded-xl border border-[#262626] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[#777] block text-[10px] uppercase font-bold">Item Selecionado:</span>
                  <strong className="text-white">{itemParaEmprestimo.nome}</strong>
                </div>
                <span className="text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                  {itemParaEmprestimo.quantidade_disponivel} disponíveis
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Loja Solicitante</label>
                  <input
                    type="text"
                    required
                    value={formEmprestimo.loja_solicitante_nome}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, loja_solicitante_nome: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Beneficiário Final (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Familiar de Obreiro da Oficina"
                    value={formEmprestimo.beneficiario_final}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, beneficiario_final: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Responsável Retirada</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do Irmão"
                    value={formEmprestimo.responsavel_retirada_nome}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, responsavel_retirada_nome: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Cargo / Função</label>
                  <input
                    type="text"
                    value={formEmprestimo.responsavel_retirada_cargo}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, responsavel_retirada_cargo: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Telefone Contato</label>
                  <input
                    type="text"
                    required
                    placeholder="(62) 9..."
                    value={formEmprestimo.responsavel_retirada_contato}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, responsavel_retirada_contato: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data de Retirada</label>
                  <CampoData
                    value={formEmprestimo.data_retirada}
                    onChange={(v) => setFormEmprestimo({...formEmprestimo, data_retirada: v})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Prazo Previsto de Devolução</label>
                  <CampoData
                    value={formEmprestimo.data_prevista_devolucao}
                    onChange={(v) => setFormEmprestimo({...formEmprestimo, data_prevista_devolucao: v})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Observações / Condições</label>
                <textarea
                  rows={2}
                  placeholder="Anotações sobre estado ou instruções de cuidado..."
                  value={formEmprestimo.observacoes}
                  onChange={(e) => setFormEmprestimo({...formEmprestimo, observacoes: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalEmprestimoAberto(false)}
                  className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Emitir Termo de Cautela
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTRAR DEVOLUÇÃO */}
      {/* ========================================================================= */}
      {modalDevolucaoAberto && cautelaParaDevolucao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sigma-bg/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Check-in de Devolução</h3>
                  <p className="text-xs text-[#888]">Reintegração do ativo ao acervo regional</p>
                </div>
              </div>
              <button onClick={() => setModalDevolucaoAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarDevolucao} className="p-6 space-y-4">
              <div className="bg-sigma-elevated p-3 rounded-xl border border-[#262626] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#777]">Item:</span>
                  <strong className="text-white">{cautelaParaDevolucao.item_nome}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#777]">Loja Solicitante:</span>
                  <span className="text-[#ddd]">{cautelaParaDevolucao.loja_solicitante_nome}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data Efetiva da Devolução</label>
                <CampoData
                  value={formDevolucao.data_efetiva_devolucao}
                  onChange={(v) => setFormDevolucao({...formDevolucao, data_efetiva_devolucao: v})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Estado de Conservação na Devolução</label>
                <select
                  value={formDevolucao.estado_conservacao_devolucao}
                  onChange={(e) => setFormDevolucao({...formDevolucao, estado_conservacao_devolucao: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                >
                  <option value="NOVO">Novo / Impecável</option>
                  <option value="OTIMO">Ótimo Estado</option>
                  <option value="BOM">Bom Estado (Uso Normal)</option>
                  <option value="REGULAR">Regular (Marcas de Uso)</option>
                  <option value="EM_MANUTENCAO">Necessita Manutenção / Higienização</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Anotações da Devolução</label>
                <textarea
                  rows={2}
                  placeholder="Relato de higienização ou conferência de acessórios..."
                  value={formDevolucao.observacoes}
                  onChange={(e) => setFormDevolucao({...formDevolucao, observacoes: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalDevolucaoAberto(false)}
                  className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" /> Homologar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ENTRAR NA FILA DE ESPERA */}
      {/* ========================================================================= */}
      {modalFilaAberto && itemParaFila && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sigma-bg/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ingresso na Fila de Espera</h3>
                  <p className="text-xs text-[#888]">Prioridade no próximo retorno de ativo ao acervo</p>
                </div>
              </div>
              <button onClick={() => setModalFilaAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarFila} className="p-6 space-y-4">
              <div className="bg-sigma-elevated p-3 rounded-xl border border-[#262626] text-xs">
                <span className="text-[#777] block text-[10px] uppercase font-bold">Item Solicitado:</span>
                <strong className="text-white">{itemParaFila.nome}</strong>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Loja Solicitante</label>
                <input
                  type="text"
                  required
                  value={formFila.loja_solicitante_nome}
                  onChange={(e) => setFormFila({...formFila, loja_solicitante_nome: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Irmão Responsável</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo"
                    value={formFila.responsavel_nome}
                    onChange={(e) => setFormFila({...formFila, responsavel_nome: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    required
                    placeholder="(62) 9..."
                    value={formFila.contato}
                    onChange={(e) => setFormFila({...formFila, contato: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Grau de Urgência</label>
                <select
                  value={formFila.grau_urgencia}
                  onChange={(e) => setFormFila({...formFila, grau_urgencia: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                >
                  <option value="NORMAL">Normal (Apoio Planejado)</option>
                  <option value="ALTA">Alta (Pós-operatório Imediato)</option>
                  <option value="URGENTE">Urgente (Sem leito/cadeira alternativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Justificativa Fraterna</label>
                <textarea
                  rows={2}
                  placeholder="Explicação da necessidade..."
                  value={formFila.observacoes}
                  onChange={(e) => setFormFila({...formFila, observacoes: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalFilaAberto(false)}
                  className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" /> Registrar na Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO DE NOVO BEM */}
      {/* ========================================================================= */}
      {modalNovoItemAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sigma-bg/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#facc15]/10 border border-[#facc15]/20 rounded-xl text-[#facc15]">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cadastrar Bem no Patrimônio</h3>
                  <p className="text-xs text-[#888]">Acervo regional ou disponibilização solidária por Loja</p>
                </div>
              </div>
              <button onClick={() => setModalNovoItemAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarNovoItem} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Tipo de Propriedade</label>
                  <select
                    value={formNovoItem.tipo_propriedade}
                    onChange={(e) => setFormNovoItem({...formNovoItem, tipo_propriedade: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  >
                    <option value="CONSELHO">Acervo do Conselho Regional</option>
                    <option value="LOJA">Rede Solidária (Disponibilizado por Loja)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Categoria</label>
                  <select
                    value={formNovoItem.categoria}
                    onChange={(e) => setFormNovoItem({...formNovoItem, categoria: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  >
                    <option value="HOSPITALAR">🏥 Hospitalar & Beneficência</option>
                    <option value="MOBILIARIO">🪑 Mobiliário & Banquetes</option>
                    <option value="AUDIOVISUAL">📻 Audiovisual & Som</option>
                    <option value="LITURGICO">🏛️ Litúrgico & Templo</option>
                    <option value="ESTRUTURAL">⛺ Tendas & Estrutura</option>
                  </select>
                </div>
              </div>

              {formNovoItem.tipo_propriedade === 'LOJA' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-emerald-400 mb-1.5">Nome da Loja Proprietária</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ARLS Firmeza e Lealdade"
                      value={formNovoItem.loja_proprietaria_nome}
                      onChange={(e) => setFormNovoItem({...formNovoItem, loja_proprietaria_nome: e.target.value})}
                      className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-emerald-400 mb-1.5">Número da Loja</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 55"
                      value={formNovoItem.loja_proprietaria_numero}
                      onChange={(e) => setFormNovoItem({...formNovoItem, loja_proprietaria_numero: e.target.value})}
                      className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Nome do Bem / Modelo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cadeira de Rodas Dobrável Alumínio Ortobrás"
                  value={formNovoItem.nome}
                  onChange={(e) => setFormNovoItem({...formNovoItem, nome: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formNovoItem.quantidade_total}
                    onChange={(e) => setFormNovoItem({...formNovoItem, quantidade_total: parseInt(e.target.value) || 1})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Estado Conservação</label>
                  <select
                    value={formNovoItem.estado_conservacao}
                    onChange={(e) => setFormNovoItem({...formNovoItem, estado_conservacao: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  >
                    <option value="NOVO">Novo</option>
                    <option value="OTIMO">Ótimo</option>
                    <option value="BOM">Bom</option>
                    <option value="REGULAR">Regular</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Código Tombamento</label>
                  <input
                    type="text"
                    placeholder="Auto gerado se vazio"
                    value={formNovoItem.codigo_tombamento}
                    onChange={(e) => setFormNovoItem({...formNovoItem, codigo_tombamento: e.target.value})}
                    className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Localização Física / Onde Retirar</label>
                <input
                  type="text"
                  placeholder="Ex: Sala de Hospitalaria - Sede Regional ou Sede da Loja"
                  value={formNovoItem.localizacao_fisica}
                  onChange={(e) => setFormNovoItem({...formNovoItem, localizacao_fisica: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Descrição e Observações</label>
                <textarea
                  rows={2}
                  placeholder="Especificações técnicas, restrições ou termos de uso..."
                  value={formNovoItem.descricao}
                  onChange={(e) => setFormNovoItem({...formNovoItem, descricao: e.target.value})}
                  className="w-full bg-sigma-elevated border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalNovoItemAberto(false)}
                  className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#facc15] hover:bg-[#eab308] text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Bem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VISUALIZAR TERMO DE CAUTELA */}
      {/* ========================================================================= */}
      {modalTermoAberto && cautelaSelecionadaTermo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sigma-bg/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-sigma-surface border border-sigma-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#facc15]/10 border border-[#facc15]/20 rounded-xl text-[#facc15]">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Termo de Cautela & Comodato</h3>
                  <p className="text-xs text-[#888]">Registro formal de guarda e responsabilidade fraterna</p>
                </div>
              </div>
              <button onClick={() => setModalTermoAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-[#ccc] max-h-[70vh] overflow-y-auto">
              <div className="text-center pb-3 border-b border-sigma-border">
                <span className="text-[10px] tracking-widest text-[#facc15] uppercase font-bold block mb-1">
                  A.'.G.'.D.'.G.'.A.'.D.'.U.'.
                </span>
                <strong className="text-sm text-white block">CONSELHO REGIONAL DE VENERÁVEIS MESTRES</strong>
                <span className="text-[11px] text-[#888]">Termo de Empréstimo e Cautela de Ativo Fraterno</span>
              </div>

              <div className="bg-sigma-elevated p-4 rounded-xl border border-[#262626] space-y-2">
                <div>
                  <span className="text-[#777] block text-[10px] uppercase font-bold">Ativo Cedido:</span>
                  <strong className="text-white text-sm">{cautelaSelecionadaTermo.item_nome}</strong>
                  <span className="text-[11px] font-mono text-[#facc15] ml-2">({cautelaSelecionadaTermo.item_codigo})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sigma-border">
                  <div>
                    <span className="text-[#666] block text-[10px]">Loja Solicitante:</span>
                    <span className="text-white font-medium">{cautelaSelecionadaTermo.loja_solicitante_nome}</span>
                  </div>
                  <div>
                    <span className="text-[#666] block text-[10px]">Beneficiário Final:</span>
                    <span className="text-[#ddd]">{cautelaSelecionadaTermo.beneficiario_final}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-sigma-elevated p-3 rounded-xl border border-sigma-border">
                  <span className="text-[#777] block text-[10px] uppercase font-bold mb-1">Responsável pela Retirada</span>
                  <strong className="text-white block">{cautelaSelecionadaTermo.responsavel_retirada_nome}</strong>
                  <span className="text-[11px] text-[#888] block">{cautelaSelecionadaTermo.responsavel_retirada_cargo || 'Representante'}</span>
                  <span className="text-[11px] text-[#888] block">Tel: {cautelaSelecionadaTermo.responsavel_retirada_contato || 'Não informado'}</span>
                </div>

                <div className="bg-sigma-elevated p-3 rounded-xl border border-sigma-border">
                  <span className="text-[#777] block text-[10px] uppercase font-bold mb-1">Responsável pela Entrega</span>
                  <strong className="text-white block">{cautelaSelecionadaTermo.responsavel_entrega_nome}</strong>
                  <span className="text-[11px] text-[#888] block">{cautelaSelecionadaTermo.responsavel_entrega_cargo || 'Conselho'}</span>
                  <span className="text-[11px] text-emerald-400 block font-semibold">Estado: {cautelaSelecionadaTermo.estado_conservacao_entrega}</span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-sigma-elevated p-3 rounded-xl border border-sigma-border">
                <div>
                  <span className="text-[#777] block text-[10px]">Data de Retirada:</span>
                  <strong className="text-white">{cautelaSelecionadaTermo.data_retirada}</strong>
                </div>
                <div>
                  <span className="text-[#777] block text-[10px]">Prazo de Devolução:</span>
                  <strong className={cautelaSelecionadaTermo.atrasado ? 'text-red-400' : 'text-[#facc15]'}>
                    {cautelaSelecionadaTermo.data_prevista_devolucao}
                  </strong>
                </div>
                <div>
                  <span className="text-[#777] block text-[10px]">Status Atual:</span>
                  <span className={`font-bold ${
                    cautelaSelecionadaTermo.status === 'CONCLUIDO' ? 'text-neutral-400' :
                    cautelaSelecionadaTermo.atrasado ? 'text-red-400' : 'text-blue-400'
                  }`}>
                    {cautelaSelecionadaTermo.status}
                  </span>
                </div>
              </div>

              {cautelaSelecionadaTermo.observacoes && (
                <div className="text-[11px] text-[#888] italic bg-[#161616] p-2.5 rounded-lg border border-sigma-border">
                  Obs: {cautelaSelecionadaTermo.observacoes}
                </div>
              )}

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end">
                <button
                  onClick={() => setModalTermoAberto(false)}
                  className="px-5 py-2 bg-sigma-elevated hover:bg-[#333] text-white text-xs font-bold rounded-xl transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
