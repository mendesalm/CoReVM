// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  MessageSquare, Building, ShieldCheck, ArrowLeft,
  Search, Plus, Send, Paperclip, FileText, Download,
  CheckCircle2, AlertTriangle, Radio,
  Lock, CheckCheck, Loader2, HeartHandshake,
  Inbox
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface TopicoItem {
  id: string;
  regiao_id: string;
  assunto: string;
  categoria: string;
  tipo_alcance: string; // 'CONSELHO_LOJA' | 'LOJA_LOJA' | 'CIRCULAR'
  loja_origem_id?: string | null;
  loja_origem_nome?: string | null;
  loja_origem_numero?: string | null;
  loja_destino_id?: string | null;
  loja_destino_nome?: string | null;
  loja_destino_numero?: string | null;
  prioridade: string;
  status: string;
  criado_por_id: string;
  criado_por_nome: string;
  criado_por_tipo: string;
  data_criacao: string;
  data_ultima_mensagem: string;
  total_mensagens: number;
  mensagens_nao_lidas: number;
  ultima_mensagem_preview: string;
  ultimo_remetente_nome: string;
  ultimo_remetente_tipo: string;
}

interface MensagemItem {
  id: string;
  remetente_id: string;
  remetente_nome: string;
  remetente_cargo?: string | null;
  tipo_remetente: string;
  loja_remetente_id?: string | null;
  conteudo: string;
  data_envio: string;
  arquivo_url?: string | null;
  arquivo_nome?: string | null;
  lida: boolean;
  data_leitura?: string | null;
  lida_por_nome?: string | null;
  sou_autor: boolean;
}

interface LojaInfo {
  id: string;
  nome: string;
  numero: string;
  rito?: string;
  cidade?: string;
}

export const PaginaComunicacao: React.FC = () => {
  const { id: regiaoId } = useParams<{ id: string }>();

  // Controle de Usuário e RBAC
  const [activeUserId, setActiveUserId] = useState('CIM_12345_PRESIDENTE');
  const [userContext, setUserContext] = useState<any>({
    usuario_id: activeUserId,
    role: 'PRESIDENTE',
    is_diretoria: true,
    loja_id: null
  });

  // Lista de Lojas Federadas
  const [lojasDisponiveis, setLojasDisponiveis] = useState<LojaInfo[]>([]);

  // Tópicos e Mensagens
  const [topicos, setTopicos] = useState<TopicoItem[]>([]);
  const [topicoSelecionado, setTopicoSelecionado] = useState<TopicoItem | null>(null);
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [estatisticas, setEstatisticas] = useState({
    total_topicos: 0,
    topicos_abertos: 0,
    topicos_concluidos: 0,
    inter_lojas_total: 0,
    circulares_total: 0,
    conselho_loja_total: 0,
    mensagens_nao_lidas: 0
  });

  // Estados de Controle de UI
  const [loadingTopicos, setLoadingTopicos] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [baixandoPdfId, setBaixandoPdfId] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Filtros
  const [filtroAlcance, setFiltroAlcance] = useState<'TODOS' | 'CONSELHO_LOJA' | 'LOJA_LOJA' | 'CIRCULAR'>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [busca, setBusca] = useState('');

  // Formulário de Resposta
  const [novoTexto, setNovoTexto] = useState('');
  const [arquivoAnexo, setArquivoAnexo] = useState<File | null>(null);

  // Modal de Novo Tópico
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [formNovo, setFormNovo] = useState({
    tipo_alcance: 'CONSELHO_LOJA',
    loja_destino_id: '',
    assunto: '',
    categoria: 'ADMINISTRATIVO',
    prioridade: 'NORMAL',
    mensagem_inicial: '',
    arquivo_url: '',
    arquivo_nome: ''
  });

  // 1. Contexto do Usuário
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const res = await axios.get(`${API_URL}/regional/${regiaoId}/me`, {
          headers: { 'X-User-ID': activeUserId }
        });
        setUserContext(res.data);
      } catch {
        setUserContext({
          usuario_id: activeUserId,
          role: activeUserId.includes('PRESIDENTE') ? 'PRESIDENTE' : 'VENERAVEL',
          is_diretoria: activeUserId.includes('PRESIDENTE') || activeUserId === 'superadmin',
          loja_id: activeUserId.startsWith('VM_') ? activeUserId.replace('VM_', '') : null
        });
      }
    };
    if (regiaoId) fetchContext();
  }, [regiaoId, activeUserId]);

  // 2. Carregar Lojas do Conselho
  useEffect(() => {
    const fetchLojas = async () => {
      if (!regiaoId) return;
      try {
        const res = await axios.get(`${API_URL}/regional/${regiaoId}/lojas`, {
          headers: { 'X-User-ID': activeUserId }
        });
        setLojasDisponiveis(res.data.lojas || []);
      } catch (err) {
        console.error("Erro ao carregar lojas:", err);
      }
    };
    fetchLojas();
  }, [regiaoId, activeUserId]);

  // 3. Carregar Estatísticas e Tópicos
  const carregarTopicos = async (manterSelecionadoId?: string) => {
    if (!regiaoId) return;
    setLoadingTopicos(true);
    setErro('');
    try {
      const headers = { 'X-User-ID': activeUserId };

      const [resEstat, resTop] = await Promise.all([
        axios.get(`${API_URL}/regional/${regiaoId}/comunicacao/estatisticas`, { headers }),
        axios.get(`${API_URL}/regional/${regiaoId}/comunicacao/topicos`, { headers })
      ]);

      setEstatisticas(resEstat.data);
      setTopicos(resTop.data);

      const targetId = manterSelecionadoId || (topicoSelecionado ? topicoSelecionado.id : null);
      if (targetId) {
        const encontrado = resTop.data.find((t: TopicoItem) => t.id === targetId);
        if (encontrado) {
          setTopicoSelecionado(encontrado);
        } else if (resTop.data.length > 0) {
          setTopicoSelecionado(resTop.data[0]);
        } else {
          setTopicoSelecionado(null);
        }
      } else if (resTop.data.length > 0) {
        setTopicoSelecionado(resTop.data[0]);
      }
    } catch (err: any) {
      console.error("Erro ao carregar tópicos:", err);
      setErro(err.response?.data?.detail || "Erro ao conectar com o canal de comunicação.");
    } finally {
      setLoadingTopicos(false);
    }
  };

  useEffect(() => {
    carregarTopicos();
  }, [regiaoId, activeUserId]);

  // 4. Carregar Mensagens do Tópico Selecionado
  const carregarMensagens = async (topicoId: string) => {
    if (!regiaoId || !topicoId) return;
    setLoadingChat(true);
    try {
      const res = await axios.get(`${API_URL}/regional/${regiaoId}/comunicacao/topicos/${topicoId}`, {
        headers: { 'X-User-ID': activeUserId }
      });
      setMensagens(res.data.mensagens || []);
    } catch (err: any) {
      console.error("Erro ao carregar mensagens do tópico:", err);
      setErro(err.response?.data?.detail || "Não foi possível carregar a correspondência.");
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (topicoSelecionado?.id) {
      carregarMensagens(topicoSelecionado.id);
    } else {
      setMensagens([]);
    }
  }, [topicoSelecionado?.id]);

  // 5. Enviar Resposta / Prancha
  const handleEnviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regiaoId || !topicoSelecionado || !novoTexto.trim()) return;

    setEnviandoMensagem(true);
    setErro('');
    try {
      const headers = { 'X-User-ID': activeUserId };

      if (arquivoAnexo) {
        const formData = new FormData();
        formData.append('conteudo', novoTexto.trim());
        formData.append('arquivo', arquivoAnexo);

        await axios.post(
          `${API_URL}/regional/${regiaoId}/comunicacao/topicos/${topicoSelecionado.id}/upload`,
          formData,
          { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
        );
      } else {
        await axios.post(
          `${API_URL}/regional/${regiaoId}/comunicacao/topicos/${topicoSelecionado.id}/mensagens`,
          { conteudo: novoTexto.trim() },
          { headers }
        );
      }

      setNovoTexto('');
      setArquivoAnexo(null);
      await carregarMensagens(topicoSelecionado.id);
      await carregarTopicos(topicoSelecionado.id);
    } catch (err: any) {
      console.error("Erro ao enviar mensagem:", err);
      setErro(err.response?.data?.detail || "Falha ao enviar resposta oficial.");
    } finally {
      setEnviandoMensagem(false);
    }
  };

  // 6. Criar Novo Tópico / Prancha
  const handleCriarTopico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regiaoId) return;

    if (!formNovo.assunto.trim() || !formNovo.mensagem_inicial.trim()) {
      setErro("Preencha o assunto e o teor da prancha inicial.");
      return;
    }

    if (formNovo.tipo_alcance === 'LOJA_LOJA' && !formNovo.loja_destino_id) {
      setErro("Selecione a Loja de destino para o canal restrito Inter-Lojas.");
      return;
    }

    setLoadingTopicos(true);
    setErro('');
    try {
      const headers = { 'X-User-ID': activeUserId };

      // Identificar loja de destino selecionada
      const lojaDest = lojasDisponiveis.find(l => l.id === formNovo.loja_destino_id);

      const payload = {
        assunto: formNovo.assunto.trim(),
        categoria: formNovo.categoria,
        tipo_alcance: formNovo.tipo_alcance,
        loja_destino_id: formNovo.loja_destino_id || null,
        loja_destino_nome: lojaDest ? lojaDest.nome : null,
        loja_destino_numero: lojaDest ? lojaDest.numero : null,
        prioridade: formNovo.prioridade,
        mensagem_inicial: formNovo.mensagem_inicial.trim(),
        arquivo_url: formNovo.arquivo_url || null,
        arquivo_nome: formNovo.arquivo_nome || null
      };

      const res = await axios.post(`${API_URL}/regional/${regiaoId}/comunicacao/topicos`, payload, { headers });
      setSucesso("Prancha oficial aberta e protocolada com sucesso!");
      setModalNovoAberto(false);
      setFormNovo({
        tipo_alcance: 'CONSELHO_LOJA',
        loja_destino_id: '',
        assunto: '',
        categoria: 'ADMINISTRATIVO',
        prioridade: 'NORMAL',
        mensagem_inicial: '',
        arquivo_url: '',
        arquivo_nome: ''
      });

      await carregarTopicos(res.data.topico_id);
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      console.error("Erro ao criar tópico:", err);
      setErro(err.response?.data?.detail || "Falha ao emitir nova prancha.");
    } finally {
      setLoadingTopicos(false);
    }
  };

  // 7. Atualizar Status do Tópico
  const handleAtualizarStatus = async (novoStatus: string) => {
    if (!regiaoId || !topicoSelecionado) return;
    try {
      await axios.put(
        `${API_URL}/regional/${regiaoId}/comunicacao/topicos/${topicoSelecionado.id}/status`,
        { status: novoStatus },
        { headers: { 'X-User-ID': activeUserId } }
      );
      setSucesso(`Status da correspondência alterado para ${novoStatus}.`);
      await carregarTopicos(topicoSelecionado.id);
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      setErro(err.response?.data?.detail || "Falha ao atualizar status.");
    }
  };

  // 8. Baixar Prancha Oficial em PDF
  const handleBaixarPranchaPdf = async (mensagemId: string) => {
    if (!regiaoId) return;
    setBaixandoPdfId(mensagemId);
    try {
      const res = await axios.get(
        `${API_URL}/regional/${regiaoId}/comunicacao/mensagens/${mensagemId}/pdf`,
        {
          headers: { 'X-User-ID': activeUserId },
          responseType: 'blob'
        }
      );

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Prancha_Oficial_${mensagemId.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSucesso("Prancha oficial em PDF baixada com sucesso!");
      setTimeout(() => setSucesso(''), 4000);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      setErro("Falha ao gerar prancha em PDF no servidor.");
    } finally {
      setBaixandoPdfId(null);
    }
  };

  // Filtragem local de tópicos
  const topicosFiltrados = topicos.filter(t => {
    const matchAlcance = filtroAlcance === 'TODOS' || t.tipo_alcance === filtroAlcance;
    const matchStatus = filtroStatus === 'TODOS' || t.status === filtroStatus;
    const matchBusca = 
      t.assunto.toLowerCase().includes(busca.toLowerCase()) ||
      (t.loja_origem_nome && t.loja_origem_nome.toLowerCase().includes(busca.toLowerCase())) ||
      (t.loja_destino_nome && t.loja_destino_nome.toLowerCase().includes(busca.toLowerCase())) ||
      t.criado_por_nome.toLowerCase().includes(busca.toLowerCase());

    return matchAlcance && matchStatus && matchBusca;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* 1. TOPO: Identificação e Simulação de Usuário */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[#121212] border border-[#222] p-4 rounded-lg">
        <div className="flex items-center space-x-3">
          <Link 
            to={`/regiao/${regiaoId}`}
            className="p-2 hover:bg-[#1a1a1a] rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Voltar ao Painel Regional"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                MÓDULO DE COMUNICAÇÃO & PRANCHAS
              </span>
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-emerald-400 font-medium">Canal Sigiloso com Criptografia de Acesso</span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2 mt-0.5">
              <MessageSquare className="w-5 h-5 text-macaonico-dourado" />
              Comunicação Interna e Correspondência Inter-Lojas
            </h1>
          </div>
        </div>

        {/* Simulador de Usuário (RBAC) */}
        <div className="flex items-center space-x-3 w-full lg:w-auto justify-end">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-gray-400">Simular Perfil:</div>
            <div className="text-xs font-semibold text-macaonico-dourado">
              {userContext.role} {userContext.loja_id ? `(Loja ${userContext.loja_id})` : ''}
            </div>
          </div>
          <select 
            value={activeUserId}
            onChange={(e) => setActiveUserId(e.target.value)}
            className="bg-[#080808] border border-[#333] text-xs text-gray-200 rounded px-3 py-2 focus:border-macaonico-dourado focus:outline-none"
          >
            <option value="CIM_12345_PRESIDENTE">Ir.'. Presidente do Conselho (Diretoria)</option>
            <option value="superadmin">SuperAdmin Estadual (Acesso Global)</option>
            <option value="VM_2">VM Roosevelt nº 1 (Oficina Federada)</option>
            <option value="VM_31">VM Independência nº 40 (Oficina Federada)</option>
            <option value="VM_60">VM São João da Escócia nº 78 (Oficina Federada)</option>
          </select>
        </div>
      </div>

      {/* Alertas */}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{erro}</span>
          </div>
          <button onClick={() => setErro('')} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>
      )}

      {sucesso && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{sucesso}</span>
          </div>
          <button onClick={() => setSucesso('')} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>
      )}

      {/* 2. CARDS DE ESTATÍSTICAS RÁPIDAS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span>Total de Pranchas</span>
            <Inbox className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{estatisticas.total_topicos}</div>
          <div className="text-[10px] text-gray-400">{estatisticas.topicos_abertos} em tramitação</div>
        </div>

        <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span>Mensagens Não Lidas</span>
            <MessageSquare className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            {estatisticas.mensagens_nao_lidas}
            {estatisticas.mensagens_nao_lidas > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div className="text-[10px] text-red-400">Aguardando seu visto</div>
        </div>

        <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span>Canais Inter-Lojas</span>
            <HeartHandshake className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400">{estatisticas.inter_lojas_total}</div>
          <div className="text-[10px] text-gray-400">Comunicação Restrita</div>
        </div>

        <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span>Pranchas Circulares</span>
            <Radio className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-400">{estatisticas.circulares_total}</div>
          <div className="text-[10px] text-gray-400">Difusão para 17 Lojas</div>
        </div>
      </div>

      {/* 3. SPLIT VIEW: LISTA DE CORRESPONDÊNCIAS (ESQUERDA) + CHAT/PRANCHA (DIREITA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-h-[650px]">
        {/* COLUNA ESQUERDA: LISTA DE TÓPICOS (5 colunas) */}
        <div className="lg:col-span-5 bg-[#121212] border border-[#222] rounded-lg flex flex-col h-[650px] overflow-hidden">
          {/* Topo da lista: Botão Nova Prancha + Filtros de Alcance */}
          <div className="p-3 border-b border-[#222] space-y-3 bg-[#161616]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Inbox className="w-4 h-4 text-macaonico-dourado" />
                Caixa de Correspondências
              </h2>
              <button
                onClick={() => setModalNovoAberto(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Prancha</span>
              </button>
            </div>

            {/* Abas Rápidas de Alcance */}
            <div className="flex space-x-1 overflow-x-auto scrollbar-none pb-0.5">
              <button
                onClick={() => setFiltroAlcance('TODOS')}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroAlcance === 'TODOS' ? 'bg-[#262626] text-amber-400 border border-amber-500/30' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Todas ({topicos.length})
              </button>

              <button
                onClick={() => setFiltroAlcance('CONSELHO_LOJA')}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroAlcance === 'CONSELHO_LOJA' ? 'bg-[#262626] text-amber-400 border border-amber-500/30' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🏛️ Conselho ↔ Loja
              </button>

              <button
                onClick={() => setFiltroAlcance('LOJA_LOJA')}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroAlcance === 'LOJA_LOJA' ? 'bg-[#262626] text-purple-400 border border-purple-500/30' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🤝 Inter-Lojas ({estatisticas.inter_lojas_total})
              </button>

              <button
                onClick={() => setFiltroAlcance('CIRCULAR')}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroAlcance === 'CIRCULAR' ? 'bg-[#262626] text-blue-400 border border-blue-500/30' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📢 Circulares
              </button>
            </div>

            {/* Campo de Busca e Filtro de Status */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                <input 
                  type="text"
                  placeholder="Buscar assunto, loja..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-[#080808] border border-[#333] text-xs text-gray-200 rounded pl-8 pr-2 py-1.5 focus:border-macaonico-dourado focus:outline-none"
                />
              </div>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="bg-[#080808] border border-[#333] text-xs text-gray-300 rounded px-2 py-1.5 focus:border-macaonico-dourado focus:outline-none"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="ABERTA">Abertas</option>
                <option value="RESPONDIDA">Respondidas</option>
                <option value="CONCLUIDA">Concluídas</option>
              </select>
            </div>
          </div>

          {/* Lista de Itens com Scroll */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1e1e1e]">
            {loadingTopicos ? (
              <div className="p-8 text-center text-gray-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                <p className="text-xs">Carregando correspondências...</p>
              </div>
            ) : topicosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-gray-500 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-gray-600" />
                <p className="text-xs font-medium">Nenhuma correspondência encontrada.</p>
                <p className="text-[11px] text-gray-600">Use o botão "Nova Prancha" para iniciar uma comunicação.</p>
              </div>
            ) : (
              topicosFiltrados.map((topico) => {
                const isSelected = topicoSelecionado?.id === topico.id;

                // Definir interlocutores visuais
                let labelInterlocutor = "";
                let iconeTipo = <Building className="w-3.5 h-3.5 text-amber-400" />;

                if (topico.tipo_alcance === 'CIRCULAR') {
                  labelInterlocutor = "Difusão Geral • Todas as 17 Lojas";
                  iconeTipo = <Radio className="w-3.5 h-3.5 text-blue-400" />;
                } else if (topico.tipo_alcance === 'LOJA_LOJA') {
                  labelInterlocutor = `${topico.loja_origem_nome || 'Loja Origem'} ➔ ${topico.loja_destino_nome || 'Loja Destino'}`;
                  iconeTipo = <HeartHandshake className="w-3.5 h-3.5 text-purple-400" />;
                } else {
                  // CONSELHO_LOJA
                  labelInterlocutor = topico.loja_origem_nome ? `Conselho ↔ ${topico.loja_origem_nome}` : (topico.loja_destino_nome ? `Conselho ↔ ${topico.loja_destino_nome}` : "Conselho ↔ Loja");
                }

                return (
                  <div
                    key={topico.id}
                    onClick={() => setTopicoSelecionado(topico)}
                    className={`p-3 cursor-pointer transition-colors space-y-1.5 ${
                      isSelected ? 'bg-[#1a1a1a] border-l-2 border-amber-400' : 'hover:bg-[#151515]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="flex items-center gap-1 font-semibold text-gray-300 truncate max-w-[220px]">
                        {iconeTipo}
                        {labelInterlocutor}
                      </span>
                      <span className="text-gray-500 text-[10px] whitespace-nowrap">
                        {topico.data_ultima_mensagem.split(' ')[0]}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-white truncate max-w-[230px]">
                        {topico.assunto}
                      </div>
                      {topico.mensagens_nao_lidas > 0 && (
                        <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-bold">
                          {topico.mensagens_nao_lidas}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-gray-400 truncate">
                      {topico.ultima_mensagem_preview || "Nenhuma mensagem registrada."}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${
                          topico.prioridade === 'URGENTE' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          topico.prioridade === 'CONFIDENCIAL' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-[#222] text-gray-400'
                        }`}>
                          {topico.prioridade}
                        </span>

                        <span className="text-gray-500">•</span>
                        <span className="text-gray-400">{topico.categoria}</span>
                      </div>

                      <span className={`px-1.5 py-0.5 rounded font-semibold ${
                        topico.status === 'CONCLUIDA' ? 'bg-emerald-500/10 text-emerald-400' :
                        topico.status === 'RESPONDIDA' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-amber-500/10 text-amber-400'
                      }`}>
                        {topico.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO DE MENSAGENS E ENVIO (7 colunas) */}
        <div className="lg:col-span-7 bg-[#121212] border border-[#222] rounded-lg flex flex-col h-[650px] overflow-hidden">
          {topicoSelecionado ? (
            <>
              {/* Cabeçalho do Chat */}
              <div className="p-4 border-b border-[#222] bg-[#161616] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    {topicoSelecionado.tipo_alcance === 'LOJA_LOJA' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> CANAL RESTRITO INTER-LOJAS
                      </span>
                    ) : topicoSelecionado.tipo_alcance === 'CIRCULAR' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <Radio className="w-3 h-3" /> PRANCHA CIRCULAR GERAL
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <Building className="w-3 h-3" /> CONSELHO ↔ LOJA
                      </span>
                    )}

                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-400">{topicoSelecionado.categoria}</span>
                  </div>

                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {topicoSelecionado.assunto}
                  </h3>
                  <div className="text-xs text-gray-400">
                    Iniciado por: <span className="text-gray-300 font-medium">{topicoSelecionado.criado_por_nome}</span> em {topicoSelecionado.data_criacao}
                  </div>
                </div>

                {/* Ações de Estado */}
                <div className="flex items-center space-x-2 self-start sm:self-center">
                  {topicoSelecionado.status !== 'CONCLUIDA' ? (
                    <button
                      onClick={() => handleAtualizarStatus('CONCLUIDA')}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded transition-colors flex items-center gap-1"
                      title="Marcar prancha/assunto como concluído"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Concluir</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAtualizarStatus('ABERTA')}
                      className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 text-xs font-semibold rounded transition-colors"
                      title="Reabrir chamado"
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              </div>

              {/* Área de Mensagens (Timeline com Scroll) */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#0c0c0c]">
                {loadingChat ? (
                  <div className="py-20 text-center text-gray-400 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                    <p className="text-xs">Carregando prancha oficial...</p>
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="py-20 text-center text-gray-500 text-xs">
                    Nenhuma mensagem registrada nesta correspondência.
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const souAutor = msg.sou_autor;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${souAutor ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[85%] rounded-lg p-3.5 space-y-2 border ${
                          souAutor 
                            ? 'bg-[#181818] border-amber-500/30 text-gray-200' 
                            : 'bg-[#141414] border-[#2c2c2c] text-gray-200'
                        }`}>
                          {/* Cabeçalho do Remetente */}
                          <div className="flex items-center justify-between gap-3 border-b border-[#222] pb-1.5 text-xs">
                            <div className="font-bold flex items-center gap-1.5 text-white">
                              {msg.tipo_remetente === 'DIRETORIA' ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <Building className="w-3.5 h-3.5 text-purple-400" />
                              )}
                              <span>{msg.remetente_nome}</span>
                              <span className="text-[10px] text-gray-400 font-normal">({msg.remetente_cargo || 'Oficial'})</span>
                            </div>

                            <span className="text-[10px] text-gray-500">{msg.data_envio}</span>
                          </div>

                          {/* Conteúdo da Prancha */}
                          <div className="text-xs leading-relaxed whitespace-pre-line text-gray-200">
                            {msg.conteudo}
                          </div>

                          {/* Anexo se houver */}
                          {msg.arquivo_nome && (
                            <div className="bg-[#080808] border border-[#2a2a2a] p-2 rounded flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2 truncate max-w-[200px]">
                                <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-gray-300 truncate">{msg.arquivo_nome}</span>
                              </div>
                              <span className="text-[10px] text-emerald-400">Anexo Protocolado</span>
                            </div>
                          )}

                          {/* Rodapé da Mensagem: Botão PDF + Confirmação de Leitura */}
                          <div className="flex items-center justify-between pt-1 border-t border-[#222] text-[10px]">
                            <button
                              onClick={() => handleBaixarPranchaPdf(msg.id)}
                              disabled={baixandoPdfId === msg.id}
                              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                              title="Emitir Prancha Oficial Canônica em PDF ReportLab"
                            >
                              {baixandoPdfId === msg.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              <span>Baixar Prancha (PDF)</span>
                            </button>

                            <div className="flex items-center space-x-1 text-gray-500">
                              {msg.lida ? (
                                <>
                                  <CheckCheck className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Visto por {msg.lida_por_nome || 'Destinatário'}</span>
                                </>
                              ) : (
                                <span>Aguardando leitura</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Formulário de Envio de Réplica */}
              <form onSubmit={handleEnviarMensagem} className="p-3 border-t border-[#222] bg-[#161616] space-y-2">
                {arquivoAnexo && (
                  <div className="flex items-center justify-between bg-[#1e1e1e] border border-[#333] px-3 py-1.5 rounded text-xs">
                    <span className="text-gray-300 flex items-center gap-1.5 truncate max-w-[250px]">
                      <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                      {arquivoAnexo.name}
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setArquivoAnexo(null)}
                      className="text-red-400 hover:text-red-300 text-xs ml-2"
                    >
                      ✕ Remover
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      rows={2}
                      placeholder="Redigir prancha / resposta oficial..."
                      value={novoTexto}
                      onChange={(e) => setNovoTexto(e.target.value)}
                      className="w-full bg-[#080808] border border-[#333] text-xs text-gray-200 rounded p-2.5 focus:border-macaonico-dourado focus:outline-none resize-none"
                    />
                  </div>

                  <label className="p-2.5 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] rounded cursor-pointer text-gray-300 hover:text-white transition-colors" title="Anexar arquivo ou prancha física">
                    <Paperclip className="w-4 h-4" />
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setArquivoAnexo(e.target.files[0]);
                        }
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={enviandoMensagem || !novoTexto.trim()}
                    className="p-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    title="Enviar Prancha Oficial"
                  >
                    {enviandoMensagem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500 space-y-3">
              <MessageSquare className="w-12 h-12 text-gray-600" />
              <div className="text-sm font-bold text-gray-400">Nenhuma correspondência selecionada</div>
              <p className="text-xs text-gray-500 max-w-sm">
                Selecione uma prancha da lista lateral ou clique em "Nova Prancha" para abrir uma correspondência institucional.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: NOVA PRANCHA OFICIAL / CANAL DE COMUNICAÇÃO */}
      {modalNovoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#222] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-macaonico-dourado" />
                Expedir Nova Prancha Oficial
              </h3>
              <button 
                onClick={() => setModalNovoAberto(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarTopico} className="space-y-3 text-xs">
              {/* Tipo de Alcance / Modalidade */}
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Modalidade da Comunicação:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormNovo({ ...formNovo, tipo_alcance: 'CONSELHO_LOJA' })}
                    className={`p-2 rounded border text-left flex flex-col justify-between ${
                      formNovo.tipo_alcance === 'CONSELHO_LOJA' 
                        ? 'border-amber-500 bg-amber-500/10 text-white font-bold' 
                        : 'border-[#333] bg-[#0c0c0c] text-gray-400'
                    }`}
                  >
                    <Building className="w-4 h-4 mb-1 text-amber-400" />
                    <span>Conselho ↔ Loja</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormNovo({ ...formNovo, tipo_alcance: 'LOJA_LOJA' })}
                    className={`p-2 rounded border text-left flex flex-col justify-between ${
                      formNovo.tipo_alcance === 'LOJA_LOJA' 
                        ? 'border-purple-500 bg-purple-500/10 text-white font-bold' 
                        : 'border-[#333] bg-[#0c0c0c] text-gray-400'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4 mb-1 text-purple-400" />
                    <span>Inter-Lojas (Restrito)</span>
                  </button>

                  {userContext.is_diretoria && (
                    <button
                      type="button"
                      onClick={() => setFormNovo({ ...formNovo, tipo_alcance: 'CIRCULAR' })}
                      className={`p-2 rounded border text-left flex flex-col justify-between ${
                        formNovo.tipo_alcance === 'CIRCULAR' 
                          ? 'border-blue-500 bg-blue-500/10 text-white font-bold' 
                          : 'border-[#333] bg-[#0c0c0c] text-gray-400'
                      }`}
                    >
                      <Radio className="w-4 h-4 mb-1 text-blue-400" />
                      <span>Circular (17 Lojas)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Se for Inter-Lojas ou Conselho->Loja, selecionar a Loja */}
              {(formNovo.tipo_alcance === 'LOJA_LOJA' || (formNovo.tipo_alcance === 'CONSELHO_LOJA' && userContext.is_diretoria)) && (
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">
                    {formNovo.tipo_alcance === 'LOJA_LOJA' ? 'Oficina Irmã Destinatária (Canal Restrito):' : 'Loja Jurisdicionada Destinatária:'}
                  </label>
                  <select
                    value={formNovo.loja_destino_id}
                    onChange={(e) => setFormNovo({ ...formNovo, loja_destino_id: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] text-gray-200 rounded p-2 focus:border-macaonico-dourado focus:outline-none"
                    required
                  >
                    <option value="">Selecione a Loja...</option>
                    {lojasDisponiveis
                      .filter(l => l.id !== userContext.loja_id)
                      .map((loja) => (
                        <option key={loja.id} value={loja.id}>
                          {loja.nome} nº {loja.numero} ({loja.rito || 'REAA'})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Assunto / Ementa */}
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Assunto / Ementa da Prancha:</label>
                <input
                  type="text"
                  placeholder="Ex: Consulta sobre Sindicância Fraterna / Solicitação de Ajuda Mútua"
                  value={formNovo.assunto}
                  onChange={(e) => setFormNovo({ ...formNovo, assunto: e.target.value })}
                  className="w-full bg-[#080808] border border-[#333] text-gray-200 rounded p-2 focus:border-macaonico-dourado focus:outline-none"
                  required
                />
              </div>

              {/* Categoria e Prioridade */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Categoria:</label>
                  <select
                    value={formNovo.categoria}
                    onChange={(e) => setFormNovo({ ...formNovo, categoria: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] text-gray-200 rounded p-2 focus:border-macaonico-dourado focus:outline-none"
                  >
                    <option value="ADMINISTRATIVO">Administrativo</option>
                    <option value="INTER_LOJAS">Inter-Lojas / Ajuda Mútua</option>
                    <option value="SINDICANCIA_CONFIDENCIAL">Sindicância Confidencial</option>
                    <option value="LITURGICO">Litúrgico / Sessões</option>
                    <option value="FINANCEIRO">Financeiro</option>
                    <option value="PROTOCOLO">Protocolo Oficial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 font-semibold mb-1">Grau de Sigilo / Prioridade:</label>
                  <select
                    value={formNovo.prioridade}
                    onChange={(e) => setFormNovo({ ...formNovo, prioridade: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] text-gray-200 rounded p-2 focus:border-macaonico-dourado focus:outline-none"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="URGENTE">Urgente</option>
                    <option value="CONFIDENCIAL">Confidencial / Sigiloso</option>
                  </select>
                </div>
              </div>

              {/* Texto da Prancha Inicial */}
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Corpo da Prancha Oficial:</label>
                <textarea
                  rows={4}
                  placeholder="Redija o teor completo do ofício ou prancha maçônica..."
                  value={formNovo.mensagem_inicial}
                  onChange={(e) => setFormNovo({ ...formNovo, mensagem_inicial: e.target.value })}
                  className="w-full bg-[#080808] border border-[#333] text-gray-200 rounded p-2 focus:border-macaonico-dourado focus:outline-none resize-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#222]">
                <button
                  type="button"
                  onClick={() => setModalNovoAberto(false)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-semibold transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded transition-colors"
                >
                  Protocolar & Expedir Prancha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaginaComunicacao;
