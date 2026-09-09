// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  FileText, ShieldCheck, Loader2, Plus, Search, ArrowLeft,
  Download, Eye, X, CheckCircle2, AlertCircle, Calendar,
  Scroll, BookOpen, Mail, Send, Award, Sparkles,
  ChevronLeft, ChevronRight, LayoutGrid, Table as TableIcon,
  FileCheck, ExternalLink, HardDriveDownload
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface DocumentoItem {
  id: string;
  regiao_id: string;
  codigo_documento: string;
  titulo: string;
  descricao_ementa?: string | null;
  categoria: string; // 'ATA' | 'DECRETO' | 'REGULAMENTO' | 'CIRCULAR' | 'CONVITE' | 'MODELO'
  tipo_origem: string; // 'CONSELHO' | 'LOJA'
  loja_emissora_id?: string | null;
  loja_emissora_nome?: string | null;
  loja_emissora_numero?: string | null;
  autor_nome: string;
  autor_cargo?: string | null;
  data_documento: string;
  data_publicacao: string;
  arquivo_url?: string | null;
  tem_arquivo: boolean;
  tamanho_bytes: number;
  downloads_count: number;
  visibilidade: string;
  conteudo_texto?: string | null;
  pode_gerenciar: boolean;
}

interface EstatisticasDocumentos {
  total_documentos: number;
  total_atas: number;
  total_decretos: number;
  total_regulamentos: number;
  total_circulares: number;
  total_convites: number;
  total_modelos: number;
  total_downloads: number;
}

export default function PaginaDocumentos() {
  const { id } = useParams<{ id: string }>();
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasDocumentos>({
    total_documentos: 0,
    total_atas: 0,
    total_decretos: 0,
    total_regulamentos: 0,
    total_circulares: 0,
    total_convites: 0,
    total_modelos: 0,
    total_downloads: 0
  });

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Modo de visualização: 'grid' ou 'tabela'
  const [modoVisualizacao, setModoVisualizacao] = useState<'grid' | 'tabela'>('grid');

  // Filtros
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [origemFiltro, setOrigemFiltro] = useState('TODOS');
  const [busca, setBusca] = useState('');

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 6;

  // Controle de Usuário e RBAC
  const [activeUserId, setActiveUserId] = useState('CIM_12345_PRESIDENTE');
  const [userContext, setUserContext] = useState<any>({
    usuario_id: activeUserId,
    role: 'PRESIDENTE',
    is_diretoria: true,
    loja_id: null
  });

  // Modais
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false);
  const [documentoVisualizando, setDocumentoVisualizando] = useState<DocumentoItem | null>(null);

  const [modalPublicarAberto, setModalPublicarAberto] = useState(false);
  const [tipoPublicacao, setTipoPublicacao] = useState<'GERAR' | 'UPLOAD'>('GERAR');

  // Formulário de Criação (Geração via ReportLab)
  const [formGerar, setFormGerar] = useState({
    codigo_documento: '',
    titulo: '',
    descricao_ementa: '',
    categoria: 'ATA',
    tipo_origem: 'CONSELHO',
    loja_emissora_id: '',
    loja_emissora_nome: '',
    loja_emissora_numero: '',
    data_documento: new Date().toISOString().split('T')[0],
    conteudo_texto: '',
    visibilidade: 'PUBLICO_CONSELHO'
  });

  // Formulário de Upload de Arquivo
  const [formUpload, setFormUpload] = useState({
    codigo_documento: '',
    titulo: '',
    descricao_ementa: '',
    categoria: 'ATA',
    tipo_origem: 'CONSELHO',
    loja_emissora_id: '',
    loja_emissora_nome: '',
    loja_emissora_numero: '',
    data_documento: new Date().toISOString().split('T')[0],
    visibilidade: 'PUBLICO_CONSELHO'
  });
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null);

  // Carregamento de Dados
  const carregarDados = async () => {
    setLoading(true);
    setErro('');
    const headers = { 'X-User-Id': activeUserId };

    try {
      // 1. Estatísticas
      try {
        const statsRes = await axios.get(`${API_URL}/regional/${id}/documentos/estatisticas`, { headers });
        if (statsRes.data) setEstatisticas(statsRes.data);
      } catch (errStats) {
        console.warn('Erro ao carregar estatísticas:', errStats);
      }

      // 2. Documentos
      try {
        const docsRes = await axios.get(`${API_URL}/regional/${id}/documentos`, {
          headers,
          params: {
            categoria: categoriaFiltro,
            tipo_origem: origemFiltro,
            busca: busca || undefined
          }
        });
        setDocumentos(Array.isArray(docsRes.data) ? docsRes.data : []);
      } catch (errDocs) {
        console.error('Erro ao carregar documentos:', errDocs);
        setErro('Não foi possível carregar os documentos.');
      }

      // 3. Contexto do Usuário
      try {
        const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
        if (userRes.data) setUserContext(userRes.data);
      } catch (errUser) {
        console.warn('Erro ao carregar usuário:', errUser);
      }

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
    setPaginaAtual(1);
  }, [id, activeUserId, categoriaFiltro, origemFiltro, busca]);

  // Handler de Troca de Usuário
  const handleTrocaUsuario = (novoUserId: string) => {
    setActiveUserId(novoUserId);
    setSucesso(`Simulando usuário: ${novoUserId}`);
    setTimeout(() => setSucesso(''), 3000);
  };

  // Submissão: Geração Automática
  const handleConfirmarGerar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.post(`${API_URL}/regional/${id}/documentos`, formGerar, { headers });
      setSucesso('Documento oficial redigido e PDF gerado com sucesso!');
      setModalPublicarAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao publicar documento.');
    }
  };

  // Submissão: Upload de Arquivo
  const handleConfirmarUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivoUpload) {
      alert('Por favor, selecione um arquivo para anexar.');
      return;
    }

    try {
      const headers = { 
        'X-User-Id': activeUserId,
        'Content-Type': 'multipart/form-data'
      };
      const data = new FormData();
      data.append('titulo', formUpload.titulo);
      data.append('categoria', formUpload.categoria);
      data.append('tipo_origem', formUpload.tipo_origem);
      if (formUpload.codigo_documento) data.append('codigo_documento', formUpload.codigo_documento);
      if (formUpload.descricao_ementa) data.append('descricao_ementa', formUpload.descricao_ementa);
      if (formUpload.loja_emissora_id) data.append('loja_emissora_id', formUpload.loja_emissora_id);
      if (formUpload.loja_emissora_nome) data.append('loja_emissora_nome', formUpload.loja_emissora_nome);
      if (formUpload.loja_emissora_numero) data.append('loja_emissora_numero', formUpload.loja_emissora_numero);
      if (formUpload.data_documento) data.append('data_documento', formUpload.data_documento);
      data.append('visibilidade', formUpload.visibilidade);
      data.append('arquivo', arquivoUpload);

      await axios.post(`${API_URL}/regional/${id}/documentos/upload`, data, { headers });
      setSucesso('Arquivo físico anexado e publicado com sucesso!');
      setModalPublicarAberto(false);
      setArquivoUpload(null);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao fazer upload do documento.');
    }
  };

  // Exclusão / Ocultação
  const handleExcluirDocumento = async (docId: string, titulo: string) => {
    if (!confirm(`Confirma a exclusão/ocultação do documento "${titulo}"?`)) return;
    try {
      const headers = { 'X-User-Id': activeUserId };
      await axios.delete(`${API_URL}/regional/${id}/documentos/${docId}`, { headers });
      setSucesso('Documento excluído com sucesso.');
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao excluir documento.');
    }
  };

  // Download do Arquivo
  const handleDownloadArquivo = (docId: string) => {
    window.open(`${API_URL}/regional/${id}/documentos/${docId}/arquivo`, '_blank');
  };

  // Paginação
  const totalPaginas = Math.ceil(documentos.length / itensPorPagina) || 1;
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const documentosPaginados = documentos.slice(indexInicio, indexInicio + itensPorPagina);

  // Helper de Cores e Badges por Categoria
  const getCategoriaInfo = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'ATA':
        return { label: 'Ata de Sessão', icon: BookOpen, corBadge: 'bg-blue-950/60 border-blue-500/30 text-blue-300' };
      case 'DECRETO':
        return { label: 'Decreto Regional', icon: Scroll, corBadge: 'bg-purple-950/60 border-purple-500/30 text-purple-300' };
      case 'REGULAMENTO':
        return { label: 'Regulamento / Estatuto', icon: Award, corBadge: 'bg-[#facc15]/10 border-[#facc15]/30 text-[#facc15]' };
      case 'CIRCULAR':
        return { label: 'Prancha Circular', icon: Mail, corBadge: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' };
      case 'CONVITE':
        return { label: 'Prancha Convite', icon: Send, corBadge: 'bg-pink-950/60 border-pink-500/30 text-pink-300' };
      case 'MODELO':
        return { label: 'Modelo Padrão', icon: FileCheck, corBadge: 'bg-amber-950/60 border-amber-500/30 text-amber-300' };
      default:
        return { label: cat, icon: FileText, corBadge: 'bg-neutral-800 border-[#333] text-[#aaa]' };
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
              <span className="text-[#facc15]">Repositório Documental</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#facc15]" />
              Documentos do Conselho Regional
            </h1>
            <p className="text-sm text-[#aaa] mt-1">
              Repositório canônico de atas de reuniões, decretos, resoluções, estatutos, pranchas circulares e convites.
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
                  <option value="superadmin" className="bg-[#181818] text-white">SuperAdmin Geral</option>
                </select>
              </div>
            </div>

            {/* Botão Novo Documento */}
            <button
              onClick={() => {
                const isDir = userContext.is_diretoria || userContext.role === 'SUPERADMIN';
                setFormGerar({
                  codigo_documento: '',
                  titulo: '',
                  descricao_ementa: '',
                  categoria: isDir ? 'ATA' : 'CONVITE',
                  tipo_origem: isDir ? 'CONSELHO' : 'LOJA',
                  loja_emissora_id: userContext.loja_id || '',
                  loja_emissora_nome: '',
                  loja_emissora_numero: '',
                  data_documento: new Date().toISOString().split('T')[0],
                  conteudo_texto: '',
                  visibilidade: 'PUBLICO_CONSELHO'
                });
                setFormUpload({
                  codigo_documento: '',
                  titulo: '',
                  descricao_ementa: '',
                  categoria: isDir ? 'ATA' : 'CONVITE',
                  tipo_origem: isDir ? 'CONSELHO' : 'LOJA',
                  loja_emissora_id: userContext.loja_id || '',
                  loja_emissora_nome: '',
                  loja_emissora_numero: '',
                  data_documento: new Date().toISOString().split('T')[0],
                  visibilidade: 'PUBLICO_CONSELHO'
                });
                setModalPublicarAberto(true);
              }}
              className="flex items-center gap-2 bg-[#facc15] hover:bg-[#eab308] text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> Publicar Documento
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

        {/* 2. PAINEL DE MÉTRICAS SUPERIOR */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#facc15]" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Repositório Geral</span>
              <FileText className="w-5 h-5 text-[#facc15] opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_documentos}</span>
              <span className="text-xs text-[#aaa]">documentos arquivados</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">
              Total de {estatisticas.total_downloads} downloads realizados
            </p>
          </div>

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Atas Plenárias</span>
              <BookOpen className="w-5 h-5 text-blue-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_atas}</span>
              <span className="text-xs text-blue-400 font-semibold">atas registradas</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Memória e deliberações das reuniões</p>
          </div>

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Decretos & Regimentos</span>
              <Scroll className="w-5 h-5 text-purple-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_decretos + estatisticas.total_regulamentos}</span>
              <span className="text-xs text-purple-400 font-semibold">normas vigentes</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Atos oficiais e regulamentos canônicos</p>
          </div>

          <div className="bg-[#121212] border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Circulares & Convites</span>
              <Mail className="w-5 h-5 text-emerald-400 opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_circulares + estatisticas.total_convites}</span>
              <span className="text-xs text-emerald-400 font-semibold">comunicados</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">Circulares do conselho e convites das Lojas</p>
          </div>
        </div>

        {/* 3. BARRA DE ABAS DE CATEGORIA */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#222] mt-8 overflow-x-auto pb-1">
          {[
            { id: 'TODAS', label: 'Todos os Documentos', count: estatisticas.total_documentos },
            { id: 'ATA', label: 'Atas de Reuniões', count: estatisticas.total_atas },
            { id: 'DECRETO', label: 'Decretos & Resoluções', count: estatisticas.total_decretos },
            { id: 'REGULAMENTO', label: 'Regulamentos & Estatuto', count: estatisticas.total_regulamentos },
            { id: 'CIRCULAR', label: 'Pranchas Circulares', count: estatisticas.total_circulares },
            { id: 'CONVITE', label: 'Convites de Lojas', count: estatisticas.total_convites },
            { id: 'MODELO', label: 'Modelos & Minutas', count: estatisticas.total_modelos }
          ].map((aba) => (
            <button
              key={aba.id}
              onClick={() => setCategoriaFiltro(aba.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                categoriaFiltro === aba.id
                  ? 'bg-[#facc15] text-black shadow-lg'
                  : 'text-[#888] hover:text-white hover:bg-[#161616]'
              }`}
            >
              <span>{aba.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                categoriaFiltro === aba.id ? 'bg-black/20 text-black' : 'bg-[#222] text-[#888]'
              }`}>
                {aba.count}
              </span>
            </button>
          ))}
        </div>

        {/* 4. BARRA DE FERRAMENTAS (BUSCA + ORIGEM + ALTERNAR VISUALIZAÇÃO) */}
        <div className="bg-[#121212] border border-[#242424] rounded-2xl p-4 my-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por título, código, ementa..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-[#181818] border border-[#303030] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#666] focus:border-[#facc15] focus:outline-none"
              />
            </div>

            <select
              value={origemFiltro}
              onChange={(e) => setOrigemFiltro(e.target.value)}
              className="bg-[#181818] border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
            >
              <option value="TODOS">Todas as Origens</option>
              <option value="CONSELHO">Mesa Diretora (Conselho)</option>
              <option value="LOJA">Lojas Jurisdicionadas</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#181818] border border-[#303030] rounded-xl p-1">
              <button
                onClick={() => setModoVisualizacao('grid')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  modoVisualizacao === 'grid' ? 'bg-[#facc15] text-black font-bold' : 'text-[#777] hover:text-white'
                }`}
                title="Visualização em Cards"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setModoVisualizacao('tabela')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  modoVisualizacao === 'tabela' ? 'bg-[#facc15] text-black font-bold' : 'text-[#777] hover:text-white'
                }`}
                title="Visualização em Tabela"
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs text-[#777]">
              Mostrando <strong className="text-white">{documentos.length}</strong> documentos
            </span>
          </div>
        </div>

        {/* 5. LISTAGEM DE DOCUMENTOS */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#888]">
            <Loader2 className="w-8 h-8 text-[#facc15] animate-spin mb-3" />
            <span className="text-xs">Carregando acervo documental oficial...</span>
          </div>
        ) : documentos.length === 0 ? (
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-12 text-center text-[#777]">
            <FileText className="w-12 h-12 text-[#444] mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Nenhum documento localizado</h3>
            <p className="text-xs max-w-md mx-auto">
              Não foram encontrados documentos com os critérios e filtros selecionados.
            </p>
          </div>
        ) : modoVisualizacao === 'grid' ? (
          /* MODO GRID DE CARDS COM PRANCHA MAÇÔNICA SIMULADA */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documentosPaginados.map((doc) => {
              const catInfo = getCategoriaInfo(doc.categoria);
              const IconeCat = catInfo.icon;
              const isLoja = doc.tipo_origem === 'LOJA';

              return (
                <div
                  key={doc.id}
                  className="bg-[#121212] border border-[#242424] hover:border-[#383838] rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-xl group relative overflow-hidden"
                >
                  <div>
                    {/* Topo: Categoria + Origem + Código */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.8 rounded-full text-[10px] font-extrabold border ${catInfo.corBadge}`}>
                        <IconeCat className="w-3 h-3" />
                        {catInfo.label}
                      </span>
                      <span className="text-[10px] font-mono text-[#888] bg-[#181818] px-2 py-0.5 rounded border border-[#2c2c2c]">
                        {doc.codigo_documento}
                      </span>
                    </div>

                    {/* MINIATURA ESTILIZADA DE PRANCHA MAÇÔNICA */}
                    <div 
                      onClick={() => {
                        setDocumentoVisualizando(doc);
                        setModalVisualizarAberto(true);
                      }}
                      className="bg-gradient-to-b from-[#181818] to-[#121212] border border-[#2b2b2b] rounded-xl p-4 mb-4 cursor-pointer hover:border-[#facc15]/50 transition-all relative group/doc"
                    >
                      <div className="text-center pb-2 border-b border-[#292929]">
                        <span className="text-[8px] tracking-widest text-[#facc15] font-bold block">
                          A.'. G.'. D.'. G.'. A.'. D.'. U.'.
                        </span>
                        <span className="text-[9px] text-[#777] font-semibold block uppercase truncate">
                          {isLoja ? doc.loja_emissora_nome : 'CONSELHO REGIONAL'}
                        </span>
                      </div>

                      <div className="py-3 space-y-1.5">
                        <div className="h-1.5 bg-[#262626] rounded w-full" />
                        <div className="h-1.5 bg-[#262626] rounded w-5/6" />
                        <div className="h-1.5 bg-[#262626] rounded w-4/6" />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#222] text-[10px] text-[#666]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[#facc15]" /> {doc.data_documento}
                        </span>
                        <span className="group-hover/doc:text-[#facc15] flex items-center gap-1 font-semibold transition-colors">
                          <Eye className="w-3 h-3" /> Visualizar Prancha
                        </span>
                      </div>
                    </div>

                    {/* Título & Ementa */}
                    <h3 className="text-sm font-bold text-white leading-snug mb-2 group-hover:text-[#facc15] transition-colors">
                      {doc.titulo}
                    </h3>

                    {doc.descricao_ementa && (
                      <p className="text-xs text-[#999] line-clamp-2 mb-3 leading-relaxed">
                        {doc.descricao_ementa}
                      </p>
                    )}

                    {/* Metadados */}
                    <div className="space-y-1 text-[11px] text-[#777] bg-[#161616] p-2.5 rounded-xl border border-[#222] mb-4">
                      <div className="flex justify-between">
                        <span>Emissor:</span>
                        <strong className="text-[#ccc] truncate max-w-[180px]">
                          {isLoja ? `Loja ${doc.loja_emissora_nome}` : 'Mesa Diretora'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Signatário:</span>
                        <span className="text-[#aaa] truncate max-w-[180px]">{doc.autor_nome}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card: Ações */}
                  <div className="pt-3 border-t border-[#222] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-[#777]">
                      <HardDriveDownload className="w-3.5 h-3.5" />
                      <span>{doc.downloads_count} downloads</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setDocumentoVisualizando(doc);
                          setModalVisualizarAberto(true);
                        }}
                        className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-xs font-semibold text-white border border-[#333] rounded-xl flex items-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#facc15]" /> Ler
                      </button>

                      <button
                        onClick={() => handleDownloadArquivo(doc.id)}
                        className="p-1.5 bg-[#1a1a1a] hover:bg-[#facc15] text-[#aaa] hover:text-black border border-[#333] rounded-xl transition-all"
                        title="Baixar PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {doc.pode_gerenciar && (
                        <button
                          onClick={() => handleExcluirDocumento(doc.id, doc.titulo)}
                          className="p-1.5 bg-[#1a1a1a] hover:bg-red-950/40 text-[#666] hover:text-red-400 border border-[#2e2e2e] rounded-xl transition-all"
                          title="Excluir / Ocultar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* MODO TABELA ANALÍTICA */
          <div className="bg-[#121212] border border-[#242424] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#ccc]">
                <thead className="bg-[#161616] text-[#777] uppercase text-[10px] tracking-wider border-b border-[#242424]">
                  <tr>
                    <th className="py-3.5 px-4">Código</th>
                    <th className="py-3.5 px-4">Título do Documento</th>
                    <th className="py-3.5 px-4">Categoria</th>
                    <th className="py-3.5 px-4">Origem / Emissor</th>
                    <th className="py-3.5 px-4">Data Oficial</th>
                    <th className="py-3.5 px-4 text-center">Downloads</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e1e]">
                  {documentosPaginados.map((doc) => {
                    const catInfo = getCategoriaInfo(doc.categoria);
                    const isLoja = doc.tipo_origem === 'LOJA';

                    return (
                      <tr key={doc.id} className="hover:bg-[#181818]/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#facc15]">
                          {doc.codigo_documento}
                        </td>
                        <td className="py-3 px-4">
                          <strong className="text-white block">{doc.titulo}</strong>
                          {doc.descricao_ementa && (
                            <span className="text-[11px] text-[#777] line-clamp-1">{doc.descricao_ementa}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${catInfo.corBadge}`}>
                            {catInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isLoja ? (
                            <span className="text-pink-300 font-medium">{doc.loja_emissora_nome}</span>
                          ) : (
                            <span className="text-[#aaa]">Conselho Regional</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#aaa]">
                          {doc.data_documento}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-[#888]">
                          {doc.downloads_count}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setDocumentoVisualizando(doc);
                                setModalVisualizarAberto(true);
                              }}
                              className="p-1.5 bg-[#1c1c1c] hover:bg-[#252525] text-[#ddd] rounded-lg transition-colors"
                              title="Visualizar"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#facc15]" />
                            </button>
                            <button
                              onClick={() => handleDownloadArquivo(doc.id)}
                              className="p-1.5 bg-[#1c1c1c] hover:bg-[#252525] text-[#ddd] rounded-lg transition-colors"
                              title="Baixar PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            {doc.pode_gerenciar && (
                              <button
                                onClick={() => handleExcluirDocumento(doc.id, doc.titulo)}
                                className="p-1.5 bg-[#1c1c1c] hover:bg-red-950/40 text-[#666] hover:text-red-400 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

      {/* ========================================================================= */}
      {/* MODAL: LEITOR DE PDF INTEGRADO */}
      {/* ========================================================================= */}
      {modalVisualizarAberto && documentoVisualizando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Topo do Visualizador */}
            <div className="p-4 border-b border-[#242424] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#facc15]/10 border border-[#facc15]/20 rounded-xl text-[#facc15]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{documentoVisualizando.titulo}</span>
                    <span className="text-xs font-mono text-[#facc15] bg-[#1c1c1c] px-2 py-0.5 rounded border border-[#2c2c2c]">
                      {documentoVisualizando.codigo_documento}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#888]">
                    Data: {documentoVisualizando.data_documento} &bull; Emissor: {documentoVisualizando.autor_nome}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadArquivo(documentoVisualizando.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#facc15] hover:bg-[#eab308] text-black text-xs font-extrabold rounded-xl shadow transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar PDF
                </button>
                <button
                  onClick={() => setModalVisualizarAberto(false)}
                  className="p-1.5 text-[#888] hover:text-white rounded-xl hover:bg-[#222]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Visualizador Iframe */}
            <div className="flex-1 bg-[#1e1e1e] relative">
              <iframe
                src={`${API_URL}/regional/${id}/documentos/${documentoVisualizando.id}/arquivo#toolbar=1`}
                title={documentoVisualizando.titulo}
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PUBLICAR NOVO DOCUMENTO */}
      {/* ========================================================================= */}
      {modalPublicarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#141414] border border-[#2b2b2b] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#facc15]/10 border border-[#facc15]/20 rounded-xl text-[#facc15]">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Publicar Documento no Conselho</h3>
                  <p className="text-xs text-[#888]">Redija uma prancha oficial ou faça upload de arquivo PDF/Docx</p>
                </div>
              </div>
              <button onClick={() => setModalPublicarAberto(false)} className="text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alternador de Modo: Gerar vs Upload */}
            <div className="p-4 bg-[#161616] border-b border-[#242424] flex gap-3">
              <button
                type="button"
                onClick={() => setTipoPublicacao('GERAR')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPublicacao === 'GERAR'
                    ? 'bg-[#facc15] text-black shadow'
                    : 'bg-[#1c1c1c] text-[#888] hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" /> Geração Automática de Prancha (ReportLab)
              </button>
              <button
                type="button"
                onClick={() => setTipoPublicacao('UPLOAD')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPublicacao === 'UPLOAD'
                    ? 'bg-[#facc15] text-black shadow'
                    : 'bg-[#1c1c1c] text-[#888] hover:text-white'
                }`}
              >
                <ExternalLink className="w-4 h-4" /> Upload de Arquivo Físico (.PDF)
              </button>
            </div>

            {/* FORMULÁRIO 1: GERAÇÃO AUTOMÁTICA */}
            {tipoPublicacao === 'GERAR' ? (
              <form onSubmit={handleConfirmarGerar} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Categoria Documental</label>
                    <select
                      value={formGerar.categoria}
                      onChange={(e) => setFormGerar({...formGerar, categoria: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    >
                      <option value="ATA">📑 Ata de Sessão / Reunião</option>
                      <option value="DECRETO">📜 Decreto Regional</option>
                      <option value="REGULAMENTO">🏛️ Regulamento / Regimento</option>
                      <option value="CIRCULAR">✉️ Prancha Circular</option>
                      <option value="CONVITE">💌 Prancha Convite de Loja</option>
                      <option value="MODELO">📐 Modelo Padronizado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Origem</label>
                    <select
                      value={formGerar.tipo_origem}
                      onChange={(e) => setFormGerar({...formGerar, tipo_origem: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    >
                      <option value="CONSELHO">Mesa Diretora do Conselho</option>
                      <option value="LOJA">Loja Jurisdicionada</option>
                    </select>
                  </div>
                </div>

                {formGerar.tipo_origem === 'LOJA' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-pink-950/20 p-3 rounded-xl border border-pink-500/20">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-pink-400 mb-1.5">Nome da Loja Emissora</label>
                      <input
                        type="text"
                        placeholder="Ex: ARLS Estrela de Anápolis"
                        value={formGerar.loja_emissora_nome}
                        onChange={(e) => setFormGerar({...formGerar, loja_emissora_nome: e.target.value})}
                        className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-pink-400 mb-1.5">Número da Loja</label>
                      <input
                        type="text"
                        placeholder="Ex: 42"
                        value={formGerar.loja_emissora_numero}
                        onChange={(e) => setFormGerar({...formGerar, loja_emissora_numero: e.target.value})}
                        className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Título do Documento</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Ata da 5ª Reunião Ordinária ou Prancha Convite Aniversário"
                    value={formGerar.titulo}
                    onChange={(e) => setFormGerar({...formGerar, titulo: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Código / Numeração</label>
                    <input
                      type="text"
                      placeholder="Auto gerado se vazio (Ex: ATA-CORE-05/2026)"
                      value={formGerar.codigo_documento}
                      onChange={(e) => setFormGerar({...formGerar, codigo_documento: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data Oficial do Ato</label>
                    <input
                      type="date"
                      required
                      value={formGerar.data_documento}
                      onChange={(e) => setFormGerar({...formGerar, data_documento: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Ementa / Resumo</label>
                  <input
                    type="text"
                    placeholder="Breve resumo do conteúdo da prancha..."
                    value={formGerar.descricao_ementa}
                    onChange={(e) => setFormGerar({...formGerar, descricao_ementa: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Conteúdo Integral da Prancha</label>
                  <textarea
                    rows={6}
                    required
                    placeholder="Redija o texto oficial da ata, decreto, circular ou convite. O ReportLab diagramará o PDF oficial automaticamente..."
                    value={formGerar.conteudo_texto}
                    onChange={(e) => setFormGerar({...formGerar, conteudo_texto: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15] font-serif leading-relaxed"
                  />
                </div>

                <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setModalPublicarAberto(false)}
                    className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#facc15] hover:bg-[#eab308] text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Gerar Prancha Oficial & Publicar
                  </button>
                </div>
              </form>
            ) : (
              /* FORMULÁRIO 2: UPLOAD DE ARQUIVO FÍSICO */
              <form onSubmit={handleConfirmarUpload} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Categoria Documental</label>
                    <select
                      value={formUpload.categoria}
                      onChange={(e) => setFormUpload({...formUpload, categoria: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    >
                      <option value="ATA">📑 Ata de Sessão / Reunião</option>
                      <option value="DECRETO">📜 Decreto Regional</option>
                      <option value="REGULAMENTO">🏛️ Regulamento / Regimento</option>
                      <option value="CIRCULAR">✉️ Prancha Circular</option>
                      <option value="CONVITE">💌 Prancha Convite de Loja</option>
                      <option value="MODELO">📐 Modelo Padronizado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Origem</label>
                    <select
                      value={formUpload.tipo_origem}
                      onChange={(e) => setFormUpload({...formUpload, tipo_origem: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    >
                      <option value="CONSELHO">Mesa Diretora do Conselho</option>
                      <option value="LOJA">Loja Jurisdicionada</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Título do Documento</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Ata Digitalizada ou Convite em PDF"
                    value={formUpload.titulo}
                    onChange={(e) => setFormUpload({...formUpload, titulo: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Código / Numeração</label>
                    <input
                      type="text"
                      placeholder="Auto gerado se vazio"
                      value={formUpload.codigo_documento}
                      onChange={(e) => setFormUpload({...formUpload, codigo_documento: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data Oficial do Ato</label>
                    <input
                      type="date"
                      required
                      value={formUpload.data_documento}
                      onChange={(e) => setFormUpload({...formUpload, data_documento: e.target.value})}
                      className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Ementa / Resumo</label>
                  <input
                    type="text"
                    placeholder="Breve descrição do teor do arquivo..."
                    value={formUpload.descricao_ementa}
                    onChange={(e) => setFormUpload({...formUpload, descricao_ementa: e.target.value})}
                    className="w-full bg-[#181818] border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Arquivo do Documento (.PDF)</label>
                  <div className="border-2 border-dashed border-[#303030] hover:border-[#facc15] rounded-xl p-6 text-center cursor-pointer bg-[#181818] transition-colors">
                    <input
                      type="file"
                      required
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setArquivoUpload(e.target.files[0]);
                        }
                      }}
                      className="w-full text-xs text-[#aaa] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#facc15] file:text-black hover:file:bg-[#eab308] cursor-pointer"
                    />
                    <p className="text-[11px] text-[#666] mt-2">Formatos recomendados: PDF ou DOCX (Até 25MB)</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#242424] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setModalPublicarAberto(false)}
                    className="px-4 py-2 bg-transparent text-xs text-[#888] hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#facc15] hover:bg-[#eab308] text-black font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" /> Anexar e Publicar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
