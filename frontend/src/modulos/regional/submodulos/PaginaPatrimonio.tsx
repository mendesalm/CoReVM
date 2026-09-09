// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  Landmark, ShieldCheck, Loader2, Plus, Search, ArrowLeft,
  CheckCircle2, Clock, X, HeartHandshake, Eye,
  FileCheck, AlertCircle, 
  ChevronLeft, ChevronRight, Check,
  Armchair, Activity, Radio
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

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

  // Aba selecionada: 'vitrine' | 'cautelas' | 'fila' | 'inventario'
  const [abaAtiva, setAbaAtiva] = useState<'vitrine' | 'cautelas' | 'fila' | 'inventario'>('vitrine');

  // Controle de Usuário e RBAC
  const [activeUserId, setActiveUserId] = useState('CIM_12345_PRESIDENTE');
  const [userContext, setUserContext] = useState<any>({
    usuario_id: activeUserId,
    role: 'PRESIDENTE',
    is_diretoria: true,
    loja_id: null
  });

  // Filtros da Vitrine e Inventário
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [propriedadeFiltro, setPropriedadeFiltro] = useState('TODOS');
  const [apenasDisponiveis, setApenasDisponiveis] = useState(false);
  const [busca, setBusca] = useState('');

  // Filtro de Cautelas
  const [statusCautelaFiltro, setStatusCautelaFiltro] = useState('TODOS');

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 6;

  // Modais
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
    const headers = { 'X-User-Id': activeUserId };

    try {
      // 1. Estatísticas
      try {
        const statsRes = await axios.get(`${API_URL}/regional/${id}/patrimonio/estatisticas`, { headers });
        if (statsRes.data) setEstatisticas(statsRes.data);
      } catch (errStats) {
        console.warn('Erro ao carregar estatísticas:', errStats);
      }

      // 2. Itens
      try {
        const itensRes = await axios.get(`${API_URL}/regional/${id}/patrimonio/itens`, {
          headers,
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
        setErro('Não foi possível carregar o inventário de bens.');
      }

      // 3. Empréstimos / Cautelas
      try {
        const empRes = await axios.get(`${API_URL}/regional/${id}/patrimonio/emprestimos`, { headers });
        setEmprestimos(Array.isArray(empRes.data) ? empRes.data : []);
      } catch (errEmp) {
        console.warn('Erro ao carregar cautelas:', errEmp);
      }

      // 4. Fila de Espera
      try {
        const filaRes = await axios.get(`${API_URL}/regional/${id}/patrimonio/fila`, { headers });
        setFila(Array.isArray(filaRes.data) ? filaRes.data : []);
      } catch (errFila) {
        console.warn('Erro ao carregar fila:', errFila);
      }

      // 5. Contexto do Usuário
      try {
        const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
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
  }, [id, activeUserId, categoriaFiltro, propriedadeFiltro, apenasDisponiveis, busca]);

  // Handler de Simulação de Usuário
  const handleTrocaUsuario = (novoUserId: string) => {
    setActiveUserId(novoUserId);
    setSucesso(`Simulando usuário: ${novoUserId}`);
    setTimeout(() => setSucesso(''), 3000);
  };

  // Submissão: Solicitar Empréstimo
  const handleConfirmarEmprestimo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemParaEmprestimo) return;

    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.post(
        `${API_URL}/regional/${id}/patrimonio/itens/${itemParaEmprestimo.id}/emprestar`,
        formEmprestimo,
        { headers }
      );
      setSucesso(`Termo de Cautela emitido com sucesso para ${itemParaEmprestimo.nome}!`);
      setModalEmprestimoAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao emitir termo de empréstimo.');
    }
  };

  // Submissão: Devolução
  const handleConfirmarDevolucao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cautelaParaDevolucao) return;

    try {
      const headers = { 'X-User-Id': activeUserId };
      const res = await axios.post(
        `${API_URL}/regional/${id}/patrimonio/emprestimos/${cautelaParaDevolucao.id}/devolver`,
        formDevolucao,
        { headers }
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
      alert(err.response?.data?.detail || 'Erro ao registrar devolução.');
    }
  };

  // Submissão: Fila de Espera
  const handleConfirmarFila = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemParaFila) return;

    try {
      const headers = { 'X-User-Id': activeUserId };
      const res = await axios.post(
        `${API_URL}/regional/${id}/patrimonio/itens/${itemParaFila.id}/fila`,
        formFila,
        { headers }
      );
      setSucesso(res.data.message || 'Demanda inserida na fila de espera com sucesso!');
      setModalFilaAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao ingressar na fila de espera.');
    }
  };

  // Submissão: Cadastro de Novo Bem
  const handleConfirmarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.post(`${API_URL}/regional/${id}/patrimonio/itens`, formNovoItem, { headers });
      setSucesso('Bem patrimonial cadastrado com sucesso no acervo regional!');
      setModalNovoItemAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao cadastrar bem patrimonial.');
    }
  };

  // Exclusão / Baixa
  const handleExcluirItem = async (itemId: string, nome: string) => {
    if (!confirm(`Confirma a baixa/ocultação do bem "${nome}" do patrimônio?`)) return;
    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.delete(`${API_URL}/regional/${id}/patrimonio/itens/${itemId}`, { headers });
      setSucesso('Item patrimonial baixado com sucesso.');
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao excluir item.');
    }
  };

  // Cancelar Fila
  const handleCancelarFila = async (filaId: string) => {
    if (!confirm('Deseja retirar esta solicitação da fila de espera?')) return;
    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.delete(`${API_URL}/regional/${id}/patrimonio/fila/${filaId}`, { headers });
      setSucesso('Solicitação removida da fila de espera.');
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao cancelar fila.');
    }
  };

  // Filtragem de Cautelas
  const cautelasFiltradas = emprestimos.filter(emp => {
    if (statusCautelaFiltro === 'TODOS') return true;
    if (statusCautelaFiltro === 'EM_DIA') return emp.status === 'ATIVO' && !emp.atrasado;
    if (statusCautelaFiltro === 'ATRASADO') return emp.atrasado;
    if (statusCautelaFiltro === 'CONCLUIDO') return emp.status === 'CONCLUIDO';
    return true;
  });

  // Paginação dos itens na Vitrine / Inventário
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
    <div className="min-h-screen bg-[#080808] text-[#f5f5f5] p-6 lg:p-8 font-sans selection:bg-[#facc15]/30">
      
      {/* 1. CABEÇALHO & BARRA DE SIMULAÇÃO */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#222] pb-6">
          <div>
            <div className="flex items-center gap-3 text-xs text-[#888] mb-2 uppercase tracking-wider">
              <Link to={`/regiao/${id}`} className="hover:text-[#facc15] flex items-center gap-1 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Painel do Conselho
              </Link>
              <span>/</span>
              <span className="text-[#facc15]">Patrimônio & Ajuda Mútua</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Landmark className="w-8 h-8 text-[#facc15]" />
              Patrimônio & Rede de Ajuda Mútua
            </h1>
            <p className="text-sm text-[#aaa] mt-1">
              Inventário de bens do conselho, cessão fraterna de ativos de hospitalaria e rede colaborativa das lojas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Simulação RBAC */}
            <div className="flex items-center gap-2 bg-[#121212] border border-[#262626] px-3 py-1.5 rounded-xl shadow-inner">
              <ShieldCheck className="w-4 h-4 text-[#facc15]" />
              <div className="flex flex-col">
                <span className="text-[10px] text-[#777] uppercase font-bold tracking-wider">Simular Usuário:</span>
                <select 
                  value={activeUserId} 
                  onChange={(e) => handleTrocaUsuario(e.target.value)}
                  className="bg-transparent text-xs text-[#f5f5f5] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="CIM_12345_PRESIDENTE" className="bg-[#181818] text-white">Mesa Diretora (Presidente)</option>
                  <option value="CIM_99887_VICE_PRESIDENTE" className="bg-[#181818] text-white">Mesa Diretora (Vice-Pres.)</option>
                  <option value="VM_42" className="bg-[#181818] text-white">VM - Estrela de Anápolis nº 42</option>
                  <option value="VM_10" className="bg-[#181818] text-white">VM - União e Trabalho nº 10</option>
                  <option value="VM_55" className="bg-[#181818] text-white">VM - Firmeza e Lealdade nº 55 (Solidária)</option>
                  <option value="superadmin" className="bg-[#181818] text-white">SuperAdmin Geral</option>
                </select>
              </div>
            </div>

            {/* Botão Novo Cadastro */}
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
              className="flex items-center gap-2 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> Cadastrar Bem
            </button>
          </div>
        </div>

        {/* ALERTA DE SUCESSO / ERRO */}
        {sucesso && (
          <div className="mt-4 p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-fade-in shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {sucesso}
            </span>
            <button onClick={() => setSucesso('')}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {erro && (
          <div className="mt-4 p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center justify-between animate-fade-in shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-400" /> {erro}
            </span>
            <button onClick={() => setErro('')}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* 2. PAINEL DE MÉTRICAS EM TEMPO REAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

        {/* 3. NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#222] mt-8">
          <button
            onClick={() => setAbaAtiva('vitrine')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              abaAtiva === 'vitrine'
                ? 'border-[#facc15] text-[#facc15] bg-[#facc15]/5'
                : 'border-transparent text-[#777] hover:text-[#bbb]'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            Vitrine de Empréstimos & Ajuda Mútua
          </button>

          <button
            onClick={() => setAbaAtiva('cautelas')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all relative ${
              abaAtiva === 'cautelas'
                ? 'border-[#facc15] text-[#facc15] bg-[#facc15]/5'
                : 'border-transparent text-[#777] hover:text-[#bbb]'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            Gestão de Cautelas & Empréstimos
            {estatisticas.total_atrasados > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full text-[10px] font-bold">
                {estatisticas.total_atrasados}
              </span>
            )}
          </button>

          <button
            onClick={() => setAbaAtiva('fila')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              abaAtiva === 'fila'
                ? 'border-[#facc15] text-[#facc15] bg-[#facc15]/5'
                : 'border-transparent text-[#777] hover:text-[#bbb]'
            }`}
          >
            <Clock className="w-4 h-4" />
            Fila de Espera Regional
            {estatisticas.fila_espera_total > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full text-[10px] font-bold">
                {estatisticas.fila_espera_total}
              </span>
            )}
          </button>

          <button
            onClick={() => setAbaAtiva('inventario')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              abaAtiva === 'inventario'
                ? 'border-[#facc15] text-[#facc15] bg-[#facc15]/5'
                : 'border-transparent text-[#777] hover:text-[#bbb]'
            }`}
          >
            <Landmark className="w-4 h-4" />
            Inventário Geral & Tombamento
          </button>
        </div>

        {/* 4. CONTEÚDO DAS ABAS */}

        {/* ABA 1: VITRINE DE EMPRÉSTIMOS & AJUDA MÚTUA */}
        {abaAtiva === 'vitrine' && (
          <div className="mt-6">
            {/* Filtros e Busca */}
            <div className="bg-[#121212] border border-[#242424] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar cadeira de rodas, muletas, mesas..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#666] focus:border-[#facc15] focus:outline-none"
                  />
                </div>

                <select
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                  className="bg-[#181818] border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
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
                  className="bg-[#181818] border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
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
                    className="rounded border-[#333] text-[#facc15] focus:ring-0 bg-[#181818]"
                  />
                  Apenas com Disponibilidade Imediata
                </label>
              </div>

              <div className="text-xs text-[#777]">
                Mostrando <span className="text-white font-bold">{itens.length}</span> ativos
              </div>
            </div>

            {/* Grid de Cards da Vitrine */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#888]">
                <Loader2 className="w-8 h-8 text-[#facc15] animate-spin mb-3" />
                <span className="text-xs">Consultando disponibilidade no acervo regional...</span>
              </div>
            ) : itens.length === 0 ? (
              <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-[#777]">
                <Landmark className="w-12 h-12 text-[#444] mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Nenhum bem patrimonial localizado</h3>
                <p className="text-xs max-w-md mx-auto">
                  Ajuste os filtros de busca ou cadastre novos ativos disponíveis para empréstimo.
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
                      className={`bg-[#121212] border rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 hover:border-[#3a3a3a] shadow-xl relative ${
                        isLoja ? 'border-emerald-500/20' : 'border-[#242424]'
                      }`}
                    >
                      <div>
                        {/* Topo do Card: Origem + Código de Tombamento */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          {isLoja ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                              <HeartHandshake className="w-3 h-3 text-emerald-400" />
                              Rede Solidária: Loja {item.loja_proprietaria_numero}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#facc15]/10 border border-[#facc15]/20 text-[#facc15] rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                              <Landmark className="w-3 h-3" />
                              Conselho Regional
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-[#777] bg-[#181818] px-2 py-0.5 rounded border border-[#2b2b2b]">
                            {item.codigo_tombamento}
                          </span>
                        </div>

                        {/* Título & Descrição */}
                        <h3 className="text-base font-bold text-white leading-snug mb-2 flex items-start gap-2.5">
                          <div className={`p-2 rounded-xl border mt-0.5 ${
                            isLoja 
                              ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400' 
                              : 'bg-[#181818] border-[#2c2c2c] text-[#facc15]'
                          }`}>
                            <IconeCat className="w-4 h-4" />
                          </div>
                          <span>{item.nome}</span>
                        </h3>

                        {item.descricao && (
                          <p className="text-xs text-[#999] line-clamp-2 mb-4 leading-relaxed">
                            {item.descricao}
                          </p>
                        )}

                        {/* Localização & Estado */}
                        <div className="space-y-1.5 text-[11px] text-[#888] bg-[#161616] p-3 rounded-xl border border-[#222] mb-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[#666]">Localização:</span>
                            <span className="text-[#ddd] truncate max-w-[200px]" title={item.localizacao_fisica || ''}>
                              {item.localizacao_fisica || 'Sede Regional'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#666]">Estado de Conservação:</span>
                            <span className="text-emerald-400 font-semibold">{item.estado_conservacao}</span>
                          </div>
                          {item.taxa_locacao_estimada && (
                            <div className="flex items-center justify-between pt-1 border-t border-[#222]">
                              <span className="text-[#666]">Locação/Cessão:</span>
                              <span className="text-[#facc15] font-semibold">{item.taxa_locacao_estimada}</span>
                            </div>
                          )}
                        </div>

                        {/* Barra de Disponibilidade */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-[#777] font-medium">Disponibilidade:</span>
                            <span className={`font-bold ${estaDisponivel ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {item.quantidade_disponivel} de {item.quantidade_total} disponíveis
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

                        {/* Badges de Estado da Loja */}
                        {item.minha_loja_tem_emprestimo && (
                          <div className="mb-3 px-3 py-1.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-blue-400" />
                            <span>Sua Loja possui cautela ativa deste bem</span>
                          </div>
                        )}
                        {item.minha_loja_na_fila && (
                          <div className="mb-3 px-3 py-1.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Sua Loja está aguardando na fila de espera</span>
                          </div>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="pt-4 border-t border-[#222] flex items-center gap-2">
                        {estaDisponivel ? (
                          <button
                            onClick={() => {
                              setItemParaEmprestimo(item);
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
                                estado_conservacao_entrega: item.estado_conservacao,
                                observacoes: ''
                              });
                              setModalEmprestimoAberto(true);
                            }}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs py-2.5 px-4 rounded-xl shadow transition-all flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Solicitar Empréstimo
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setItemParaFila(item);
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
                            className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs py-2.5 px-4 rounded-xl shadow transition-all flex items-center justify-center gap-2"
                          >
                            <Clock className="w-4 h-4" /> Entrar na Fila ({item.fila_espera_count})
                          </button>
                        )}

                        {item.pode_gerenciar && (
                          <button
                            onClick={() => handleExcluirItem(item.id, item.nome)}
                            title="Baixa/Ocultar Bem"
                            className="p-2.5 bg-[#181818] hover:bg-red-950/40 text-[#666] hover:text-red-400 border border-[#2b2b2b] rounded-xl transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-8 border-t border-[#222] pt-4 text-xs text-[#888]">
                <span>Página {paginaAtual} de {totalPaginas}</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={paginaAtual <= 1}
                    onClick={() => setPaginaAtual(p => p - 1)}
                    className="p-2 bg-[#121212] border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={paginaAtual >= totalPaginas}
                    onClick={() => setPaginaAtual(p => p + 1)}
                    className="p-2 bg-[#121212] border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 2: GESTÃO DE CAUTELAS & EMPRÉSTIMOS ATIVOS */}
        {abaAtiva === 'cautelas' && (
          <div className="mt-6">
            <div className="bg-[#121212] border border-[#242424] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#777] font-bold uppercase tracking-wider">Filtrar por Status:</span>
                <select
                  value={statusCautelaFiltro}
                  onChange={(e) => setStatusCautelaFiltro(e.target.value)}
                  className="bg-[#181818] border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
                >
                  <option value="TODOS">Todas as Cautelas</option>
                  <option value="EM_DIA">🟢 Ativos em Dia</option>
                  <option value="ATRASADO">🔴 Em Atraso / Vencidos</option>
                  <option value="CONCLUIDO">⚪ Concluídos / Devolvidos</option>
                </select>
              </div>

              <span className="text-xs text-[#777]">
                Total de cautelas: <strong className="text-white">{cautelasFiltradas.length}</strong>
              </span>
            </div>

            {cautelasFiltradas.length === 0 ? (
              <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-[#777]">
                <FileCheck className="w-12 h-12 text-[#444] mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Nenhuma cautela localizada</h3>
                <p className="text-xs">Não existem empréstimos com os filtros selecionados.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cautelasFiltradas.map((emp) => {
                  const isAtrasado = emp.atrasado;
                  const isConcluido = emp.status === 'CONCLUIDO';

                  return (
                    <div
                      key={emp.id}
                      className={`bg-[#121212] border rounded-2xl p-5 transition-all shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        isAtrasado 
                          ? 'border-red-500/40 bg-red-950/10' 
                          : isConcluido 
                          ? 'border-[#222] opacity-75' 
                          : 'border-[#2a2a2a]'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[10px] font-mono text-[#888] bg-[#181818] px-2 py-0.5 rounded border border-[#2c2c2c]">
                            {emp.item_codigo}
                          </span>
                          <span className="text-xs font-bold text-white">{emp.item_nome}</span>
                          
                          {isConcluido ? (
                            <span className="px-2.5 py-0.5 bg-neutral-800 text-[#aaa] rounded-full text-[10px] font-bold">
                              ✓ Devolvido em {emp.data_efetiva_devolucao}
                            </span>
                          ) : isAtrasado ? (
                            <span className="px-2.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full text-[10px] font-bold animate-pulse">
                              ⚠️ Vencido ({Math.abs(emp.dias_restantes)} dias de atraso)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-[10px] font-bold">
                              ⏳ Ativo ({emp.dias_restantes} dias restantes)
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#888] bg-[#161616] p-3 rounded-xl border border-[#222]">
                          <div>
                            <span className="text-[10px] text-[#666] block">Loja Solicitante:</span>
                            <strong className="text-[#ddd]">{emp.loja_solicitante_nome}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#666] block">Responsável Retirada:</span>
                            <span className="text-[#ddd]">{emp.responsavel_retirada_nome} ({emp.responsavel_retirada_contato || 'Sem tel'})</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#666] block">Data de Retirada:</span>
                            <span className="text-[#ddd]">{emp.data_retirada}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#666] block">Prazo de Devolução:</span>
                            <strong className={isAtrasado ? 'text-red-400' : 'text-[#ddd]'}>
                              {emp.data_prevista_devolucao}
                            </strong>
                          </div>
                        </div>

                        {emp.beneficiario_final && (
                          <div className="mt-2 text-[11px] text-[#777] italic">
                            Beneficiário: <span className="text-[#aaa]">{emp.beneficiario_final}</span>
                          </div>
                        )}
                      </div>

                      {/* Ações da Cautela */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCautelaSelecionadaTermo(emp);
                            setModalTermoAberto(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#181818] hover:bg-[#222] border border-[#303030] text-xs text-[#ddd] rounded-xl transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#facc15]" /> Ver Termo
                        </button>

                        {!isConcluido && (emp.pode_gerenciar || userContext.is_diretoria) && (
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
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl shadow transition-all"
                          >
                            <Check className="w-3.5 h-3.5" /> Registrar Devolução
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ABA 3: FILA DE ESPERA REGIONAL */}
        {abaAtiva === 'fila' && (
          <div className="mt-6">
            <div className="bg-[#121212] border border-[#242424] rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Demandas Regionais em Espera</h3>
                <p className="text-xs text-[#888]">
                  Quando um item é devolvido, a 1ª Loja da fila é notificada prioritariamente.
                </p>
              </div>
              <span className="text-xs font-bold text-amber-400 bg-amber-950/40 px-3 py-1 rounded-full border border-amber-500/30">
                {fila.length} aguardando
              </span>
            </div>

            {fila.length === 0 ? (
              <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-[#777]">
                <Clock className="w-12 h-12 text-[#444] mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Fila de espera vazia</h3>
                <p className="text-xs">Não há Lojas aguardando liberação de itens no momento.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {fila.map((itemFila) => (
                  <div
                    key={itemFila.id}
                    className="bg-[#121212] border border-[#262626] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-sm flex items-center justify-center shrink-0">
                        {itemFila.posicao}º
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{itemFila.item_nome}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            itemFila.grau_urgencia === 'URGENTE' 
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                              : itemFila.grau_urgencia === 'ALTA'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-neutral-800 text-[#aaa]'
                          }`}>
                            {itemFila.grau_urgencia}
                          </span>
                        </div>
                        <div className="text-xs text-[#888]">
                          Solicitante: <strong className="text-[#ddd]">{itemFila.loja_solicitante_nome}</strong> • Contato: {itemFila.responsavel_nome} ({itemFila.contato || 'Sem tel'})
                        </div>
                        {itemFila.observacoes && (
                          <div className="text-[11px] text-[#aaa] mt-1 italic">
                            "{itemFila.observacoes}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {itemFila.item_disponivel_agora > 0 && (
                        <span className="text-xs text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl animate-pulse">
                          ✨ {itemFila.item_disponivel_agora} un. já liberada!
                        </span>
                      )}

                      <button
                        onClick={() => handleCancelarFila(itemFila.id)}
                        className="px-3 py-1.5 bg-[#181818] hover:bg-red-950/30 text-[#777] hover:text-red-400 border border-[#2b2b2b] text-xs rounded-xl transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 4: INVENTÁRIO GERAL & TOMBAMENTO */}
        {abaAtiva === 'inventario' && (
          <div className="mt-6 bg-[#121212] border border-[#242424] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#222] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">Inventário Patrimonial Regional</h3>
                <p className="text-xs text-[#777]">Relação analítica de todos os bens tombados e sob comodato</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filtrar tabela..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="bg-[#181818] border border-[#303030] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#ccc]">
                <thead className="bg-[#161616] text-[#777] uppercase text-[10px] tracking-wider border-b border-[#242424]">
                  <tr>
                    <th className="py-3 px-4">Plaqueta / Código</th>
                    <th className="py-3 px-4">Nome do Ativo</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Propriedade</th>
                    <th className="py-3 px-4 text-center">Quantidades</th>
                    <th className="py-3 px-4">Localização Atual</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e1e]">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-[#181818]/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#facc15]">
                        {item.codigo_tombamento}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {item.nome}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-[#202020] rounded text-[10px] text-[#aaa]">
                          {item.categoria}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.tipo_propriedade === 'LOJA' ? (
                          <span className="text-emerald-400 font-medium">Loja {item.loja_proprietaria_numero}</span>
                        ) : (
                          <span className="text-[#aaa]">Conselho Regional</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-emerald-400 font-bold">{item.quantidade_disponivel}</span>
                        <span className="text-[#666]"> / </span>
                        <span className="text-white">{item.quantidade_total}</span>
                      </td>
                      <td className="py-3 px-4 text-[#999] truncate max-w-[180px]" title={item.localizacao_fisica || ''}>
                        {item.localizacao_fisica || 'Sede Regional'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-emerald-400 font-medium">{item.estado_conservacao}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.pode_gerenciar && (
                          <button
                            onClick={() => handleExcluirItem(item.id, item.nome)}
                            className="p-1.5 text-[#666] hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                            title="Excluir/Baixar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL: SOLICITAR EMPRÉSTIMO / CAUTELA */}
      {/* ========================================================================= */}
      {modalEmprestimoAberto && itemParaEmprestimo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
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
              <div className="bg-[#181818] p-3 rounded-xl border border-[#262626] flex items-center justify-between text-xs">
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Beneficiário Final (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Familiar de Obreiro da Oficina"
                    value={formEmprestimo.beneficiario_final}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, beneficiario_final: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Cargo / Função</label>
                  <input
                    type="text"
                    value={formEmprestimo.responsavel_retirada_cargo}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, responsavel_retirada_cargo: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data de Retirada</label>
                  <input
                    type="date"
                    required
                    value={formEmprestimo.data_retirada}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, data_retirada: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Prazo Previsto de Devolução</label>
                  <input
                    type="date"
                    required
                    value={formEmprestimo.data_prevista_devolucao}
                    onChange={(e) => setFormEmprestimo({...formEmprestimo, data_prevista_devolucao: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
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
              <div className="bg-[#181818] p-3 rounded-xl border border-[#262626] text-xs space-y-1">
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
                <input
                  type="date"
                  required
                  value={formDevolucao.data_efetiva_devolucao}
                  onChange={(e) => setFormDevolucao({...formDevolucao, data_efetiva_devolucao: e.target.value})}
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Estado de Conservação na Devolução</label>
                <select
                  value={formDevolucao.estado_conservacao_devolucao}
                  onChange={(e) => setFormDevolucao({...formDevolucao, estado_conservacao_devolucao: e.target.value})}
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
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
              <div className="bg-[#181818] p-3 rounded-xl border border-[#262626] text-xs">
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Grau de Urgência</label>
                <select
                  value={formFila.grau_urgencia}
                  onChange={(e) => setFormFila({...formFila, grau_urgencia: e.target.value})}
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
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

            <form onSubmit={handleConfirmarNovoItem} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Tipo de Propriedade</label>
                  <select
                    value={formNovoItem.tipo_propriedade}
                    onChange={(e) => setFormNovoItem({...formNovoItem, tipo_propriedade: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
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
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Estado Conservação</label>
                  <select
                    value={formNovoItem.estado_conservacao}
                    onChange={(e) => setFormNovoItem({...formNovoItem, estado_conservacao: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Descrição e Observações</label>
                <textarea
                  rows={2}
                  placeholder="Especificações técnicas, restrições ou termos de uso..."
                  value={formNovoItem.descricao}
                  onChange={(e) => setFormNovoItem({...formNovoItem, descricao: e.target.value})}
                  className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
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

            <div className="p-6 space-y-4 text-xs text-[#ccc]">
              <div className="text-center pb-3 border-b border-[#222]">
                <span className="text-[10px] tracking-widest text-[#facc15] uppercase font-bold block mb-1">
                  A.'.G.'.D.'.G.'.A.'.D.'.U.'.
                </span>
                <strong className="text-sm text-white block">CONSELHO REGIONAL DE VENERÁVEIS MESTRES</strong>
                <span className="text-[11px] text-[#888]">Termo de Empréstimo e Cautela de Ativo Fraterno</span>
              </div>

              <div className="bg-[#181818] p-4 rounded-xl border border-[#262626] space-y-2">
                <div>
                  <span className="text-[#777] block text-[10px] uppercase font-bold">Ativo Cedido:</span>
                  <strong className="text-white text-sm">{cautelaSelecionadaTermo.item_nome}</strong>
                  <span className="text-[11px] font-mono text-[#facc15] ml-2">({cautelaSelecionadaTermo.item_codigo})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#222]">
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
                <div className="bg-[#181818] p-3 rounded-xl border border-[#222]">
                  <span className="text-[#777] block text-[10px] uppercase font-bold mb-1">Responsável pela Retirada</span>
                  <strong className="text-white block">{cautelaSelecionadaTermo.responsavel_retirada_nome}</strong>
                  <span className="text-[11px] text-[#888] block">{cautelaSelecionadaTermo.responsavel_retirada_cargo || 'Representante'}</span>
                  <span className="text-[11px] text-[#888] block">Tel: {cautelaSelecionadaTermo.responsavel_retirada_contato || 'Não informado'}</span>
                </div>

                <div className="bg-[#181818] p-3 rounded-xl border border-[#222]">
                  <span className="text-[#777] block text-[10px] uppercase font-bold mb-1">Responsável pela Entrega</span>
                  <strong className="text-white block">{cautelaSelecionadaTermo.responsavel_entrega_nome}</strong>
                  <span className="text-[11px] text-[#888] block">{cautelaSelecionadaTermo.responsavel_entrega_cargo || 'Conselho'}</span>
                  <span className="text-[11px] text-emerald-400 block font-semibold">Estado: {cautelaSelecionadaTermo.estado_conservacao_entrega}</span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-[#181818] p-3 rounded-xl border border-[#222]">
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
                <div className="text-[11px] text-[#888] italic bg-[#161616] p-2.5 rounded-lg border border-[#222]">
                  Obs: {cautelaSelecionadaTermo.observacoes}
                </div>
              )}

              <div className="pt-4 border-t border-[#242424] flex items-center justify-end">
                <button
                  onClick={() => setModalTermoAberto(false)}
                  className="px-5 py-2 bg-[#222] hover:bg-[#333] text-white text-xs font-bold rounded-xl transition-all"
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
