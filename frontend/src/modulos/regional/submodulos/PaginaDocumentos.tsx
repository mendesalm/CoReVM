// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { clienteHttp, API_URL } from '../../../compartilhado/contextos/AuthContext';
import { CampoData } from '../../../compartilhado/componentes/SeletorDataHora';
import {
  FileText, Loader2, Plus, Search, ArrowLeft,
  Download, Eye, X, CheckCircle2, AlertCircle, Calendar,
  Scroll, BookOpen, Mail, Send, Award, Sparkles,
  ChevronLeft, ChevronRight, LayoutGrid, Table as TableIcon,
  FileCheck, ExternalLink, HardDriveDownload, RotateCcw, Archive
} from 'lucide-react';

// CORREÇÃO (2026-09-21): mesmo padrão pré-migração de segurança de
// 2026-09-11 já corrigido em PaginaAdmissoes.tsx/PaginaVotacoes.tsx/
// PaginaPatrimonio.tsx/PaginaComunicacao.tsx (ver Blocos B.5/B.8/B.12/B.13
// do roteiro de testes manuais) — `axios` puro + header `X-User-Id` não
// autenticado, rejeitado com 422 desde que `obter_usuario_esigma` passou a
// exigir `Authorization: Bearer` real. `detail` de um 422 do FastAPI é uma
// LISTA de objetos ({type, loc, msg, input}), não uma string.
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

function formatarTamanho(bytes?: number): string {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
  data_expiracao?: string | null;
  arquivado?: boolean;
  arquivado_em?: string | null;
  arquivado_por?: string | null;
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
  // Expiração automática (2026-09-22, a pedido do usuário): documentos/convites
  // arquivados (manual ou automaticamente pelo agendador do backend) ficam
  // escondidos por padrão -- mesmo padrão já usado em Avisos/Eventos.
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 6;

  // Contexto do Usuário (vem de GET /me, autenticado via clienteHttp)
  const [userContext, setUserContext] = useState<any>({
    usuario_id: '',
    role: '',
    is_diretoria: false,
    loja_id: null
  });

  // Modais
  
  // Edição
  const [isEditing, setIsEditing] = useState(false);
  const [formEdit, setFormEdit] = useState({
    titulo: '',
    descricao_ementa: '',
    categoria: '',
    data_documento: '',
    data_expiracao: '',
    visibilidade: ''
  });

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentoVisualizando) return;
    try {
      await clienteHttp.put(`${API_URL}/regional/${id}/documentos/${documentoVisualizando.id}`, {
        ...formEdit,
        data_expiracao: formEdit.data_expiracao || null
      });
      setSucesso('Documento atualizado com sucesso!');
      setIsEditing(false);
      setModalVisualizarAberto(false);
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao atualizar documento.'));
    }
  };

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
    data_expiracao: '',
    conteudo_texto: '',
    visibilidade: 'PUBLICO_CONSELHO'
  });
  // Checkbox "expira automaticamente" -- separado do valor em si para poder
  // esconder/limpar o campo de data sem perder o texto se a pessoa desmarcar
  // e remarcar (mesmo padrão já usado no formulário de Eventos/Convites do
  // painel Minha Loja).
  const [temExpiracaoGerar, setTemExpiracaoGerar] = useState(false);

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
    data_expiracao: '',
    visibilidade: 'PUBLICO_CONSELHO'
  });
  const [temExpiracaoUpload, setTemExpiracaoUpload] = useState(false);
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null);

  // Carregamento de Dados
  const carregarDados = async () => {
    setLoading(true);
    setErro('');

    try {
      // 1. Estatísticas
      try {
        const statsRes = await clienteHttp.get(`${API_URL}/regional/${id}/documentos/estatisticas`);
        if (statsRes.data) setEstatisticas(statsRes.data);
      } catch (errStats) {
        console.warn('Erro ao carregar estatísticas:', errStats);
      }

      // 2. Documentos
      try {
        const docsRes = await clienteHttp.get(`${API_URL}/regional/${id}/documentos`, {
          params: {
            categoria: categoriaFiltro,
            tipo_origem: origemFiltro,
            busca: busca || undefined,
            incluir_arquivados: mostrarArquivados
          }
        });
        setDocumentos(Array.isArray(docsRes.data) ? docsRes.data : []);
      } catch (errDocs) {
        console.error('Erro ao carregar documentos:', errDocs);
        setErro(extrairMensagemErro(errDocs, 'Não foi possível carregar os documentos.'));
      }

      // 3. Contexto do Usuário
      try {
        const userRes = await clienteHttp.get(`${API_URL}/regional/${id}/me`);
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
  }, [id, categoriaFiltro, origemFiltro, busca, mostrarArquivados]);

  // Submissão: Geração Automática
  const handleConfirmarGerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (temExpiracaoGerar && !formGerar.data_expiracao) {
      alert('Informe a data de expiração ou desmarque a opção "Expira automaticamente".');
      return;
    }
    try {
      await clienteHttp.post(`${API_URL}/regional/${id}/documentos`, {
        ...formGerar,
        data_expiracao: temExpiracaoGerar && formGerar.data_expiracao ? formGerar.data_expiracao : null
      });
      setSucesso('Documento oficial redigido e PDF gerado com sucesso!');
      setModalPublicarAberto(false);
      setTemExpiracaoGerar(false);
      setFormGerar((f) => ({ ...f, data_expiracao: '' }));
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao publicar documento.'));
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
      if (temExpiracaoUpload && formUpload.data_expiracao) data.append('data_expiracao', formUpload.data_expiracao);
      data.append('visibilidade', formUpload.visibilidade);
      data.append('arquivo', arquivoUpload);

      await clienteHttp.post(`${API_URL}/regional/${id}/documentos/upload`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSucesso('Arquivo físico anexado e publicado com sucesso!');
      setModalPublicarAberto(false);
      setArquivoUpload(null);
      setTemExpiracaoUpload(false);
      setFormUpload((f) => ({ ...f, data_expiracao: '' }));
      carregarDados();
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao fazer upload do documento.'));
    }
  };

  // Exclusão / Ocultação
  const handleExcluirDocumento = async (docId: string, titulo: string) => {
    if (!confirm(`Confirma a exclusão/ocultação do documento "${titulo}"?`)) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/documentos/${docId}`);
      setSucesso('Documento excluído com sucesso.');
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao excluir documento.'));
    }
  };

  // Reativa um documento/convite arquivado manualmente ou por expiração
  // automática -- ver PUT /documentos/{id}/reativar (mesmo mecanismo de
  // PUT /avisos/{id}/reativar).
  const handleReativarDocumento = async (docId: string, titulo: string) => {
    try {
      await clienteHttp.put(`${API_URL}/regional/${id}/documentos/${docId}/reativar`);
      setSucesso(`Documento "${titulo}" reativado com sucesso.`);
      carregarDados();
      setTimeout(() => setSucesso(''), 4000);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao reativar documento.'));
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
        return { label: 'Regulamento / Estatuto', icon: Award, corBadge: 'bg-slate-700 border border-sigma-border border-[#facc15]/30 title-sigma-gold' };
      case 'CIRCULAR':
        return { label: 'Prancha Circular', icon: Mail, corBadge: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' };
      case 'CONVITE':
        return { label: 'Prancha Convite', icon: Send, corBadge: 'bg-pink-950/60 border-pink-500/30 text-pink-300' };
      case 'MODELO':
        return { label: 'Modelo Padrão', icon: FileCheck, corBadge: 'bg-amber-950/60 border-amber-500/30 text-amber-300' };
      default:
        return { label: cat, icon: FileText, corBadge: 'bg-neutral-800 border-sigma-border text-[#aaa]' };
    }
  };

  return (
    <div className="min-h-screen bg-[#070e1c] text-gray-200">
      
      {/* 1. CABEÇALHO & BARRA DE SIMULAÇÃO */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sigma-border pb-6">
          <div>
            <div className="flex items-center gap-3 text-xs text-[#888] mb-2 uppercase tracking-wider">
              <Link to={`/regiao/${id}`} className="hover:title-sigma-gold flex items-center gap-1 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Painel do Conselho
              </Link>
              <span>/</span>
              <span className="title-sigma-gold">Repositório Documental</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <FileText className="w-8 h-8 title-sigma-gold" />
              Documentos do Conselho Regional
            </h1>
            <p className="text-sm text-[#aaa] mt-1">
              Repositório canônico de atas de reuniões, decretos, resoluções, estatutos, pranchas circulares e convites.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
                  data_expiracao: '',
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
                  data_expiracao: '',
                  visibilidade: 'PUBLICO_CONSELHO'
                });
                setTemExpiracaoGerar(false);
                setTemExpiracaoUpload(false);
                setModalPublicarAberto(true);
              }}
              className="flex items-center gap-2 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all hover:scale-[1.02]"
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
        <div className="hidden lg:grid lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800 border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-sigma-gold text-[#070F1E] shadow-md" />
            <div className="flex items-center justify-between text-[#888] mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Repositório Geral</span>
              <FileText className="w-5 h-5 title-sigma-gold opacity-80" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{estatisticas.total_documentos}</span>
              <span className="text-xs text-[#aaa]">documentos arquivados</span>
            </div>
            <p className="text-[11px] text-[#666] mt-2">
              Total de {estatisticas.total_downloads} downloads realizados
            </p>
          </div>

          <div className="bg-slate-800 border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

          <div className="bg-slate-800 border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

          <div className="bg-slate-800 border border-[#242424] rounded-2xl p-5 shadow-lg relative overflow-hidden group">
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

        {/* 4. BARRA DE FERRAMENTAS (BUSCA + ORIGEM + ALTERNAR VISUALIZAÇÃO) */}
        <div className="bg-slate-800 border border-[#242424] rounded-2xl p-4 my-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-[#666] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por título, código, ementa..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-700 border border-[#303030] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#666] focus:border-[#facc15] focus:outline-none"
              />
            </div>

            <select
              value={origemFiltro}
              onChange={(e) => setOrigemFiltro(e.target.value)}
              className="bg-slate-700 border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none"
            >
              <option value="TODOS">Todas as Origens</option>
              <option value="CONSELHO">Mesa Diretora (Conselho)</option>
              <option value="LOJA">Lojas Jurisdicionadas</option>
            </select>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="bg-slate-700 border border-[#303030] text-xs text-[#ddd] rounded-xl px-3 py-2 focus:border-[#facc15] focus:outline-none cursor-pointer"
            >
              <option value="TODAS">Todos os Documentos ({estatisticas.total_documentos})</option>
              <option value="ATA">Atas de Reuniões ({estatisticas.total_atas})</option>
              <option value="DECRETO">Decretos & Resoluções ({estatisticas.total_decretos})</option>
              <option value="REGULAMENTO">Regulamentos & Estatuto ({estatisticas.total_regulamentos})</option>
              <option value="CIRCULAR">Pranchas Circulares ({estatisticas.total_circulares})</option>
              <option value="CONVITE">Convites de Lojas ({estatisticas.total_convites})</option>
              <option value="MODELO">Modelos & Minutas ({estatisticas.total_modelos})</option>
            </select>


            <label className="flex items-center gap-1.5 text-xs font-medium text-[#999] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarArquivados}
                onChange={(e) => setMostrarArquivados(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#facc15] bg-slate-700 border-[#303030] rounded"
              />
              Mostrar arquivados
            </label>
          </div>

          <div className="flex items-center gap-3">
            

            <span className="text-xs text-[#777]">
              Mostrando <strong className="text-white">{documentos.length}</strong> documentos
            </span>
          </div>
        </div>

        {/* 5. LISTAGEM DE DOCUMENTOS */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#888]">
            <Loader2 className="w-8 h-8 title-sigma-gold animate-spin mb-3" />
            <span className="text-xs">Carregando acervo documental oficial...</span>
          </div>
        ) : documentos.length === 0 ? (
          <div className="bg-slate-800 border border-sigma-border rounded-2xl p-12 text-center text-[#777]">
            <FileText className="w-12 h-12 text-[#444] mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Nenhum documento localizado</h3>
            <p className="text-xs max-w-md mx-auto">
              Não foram encontrados documentos com os critérios e filtros selecionados.
            </p>
          </div>
        ) : (
          /* MODO LISTA SIMPLES MOBILE-FIRST (MASTER) - NATURAL TABLE */
          <div className="bg-transparent w-full overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="hidden sm:table-header-group border-b border-slate-700/60">
                <tr>
                  <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Documento</th>
                  <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documentosPaginados.map((doc) => {
                  const catInfo = getCategoriaInfo(doc.categoria);
                  const IconeCat = catInfo.icon;
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => {
                        setDocumentoVisualizando(doc);
                        setFormEdit({
                          titulo: doc.titulo,
                          descricao_ementa: doc.descricao_ementa || '',
                          categoria: doc.categoria,
                          data_documento: doc.data_documento,
                          data_expiracao: doc.data_expiracao || '',
                          visibilidade: doc.visibilidade
                        });
                        setIsEditing(false);
                        setModalVisualizarAberto(true);
                      }}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer block sm:table-row py-1 sm:py-0 group ${doc.arquivado ? 'opacity-60' : ''}`}
                    >
                      <td className="py-2.5 sm:py-3 px-2 block sm:table-cell align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border ${catInfo.corBadge}`}>
                              <IconeCat className="w-2.5 h-2.5" />
                              {catInfo.label}
                            </span>
                            {doc.arquivado && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-gray-600 text-gray-400 bg-gray-900/40">
                                <Archive className="w-2.5 h-2.5" /> Arquivado
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-1">{doc.titulo}</h3>
                        </div>
                      </td>
                      <td className="pt-0 pb-2.5 sm:py-3 px-2 block sm:table-cell sm:text-right align-middle">
                        <div className="text-[11px] text-slate-500">
                          {new Date(doc.data_documento).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                className="p-2 bg-slate-800 border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPaginaAtual(p => p + 1)}
                className="p-2 bg-slate-800 border border-[#242424] rounded-lg disabled:opacity-30 hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DRAWER: DETALHES DO DOCUMENTO */}
      {/* ========================================================================= */}
      {modalVisualizarAberto && documentoVisualizando && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-40 bg-[#070e1c]/80 backdrop-blur-sm transition-opacity"
            onClick={() => setModalVisualizarAberto(false)}
          />
          
          {/* Drawer Lateral */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-slate-800 border-l border-sigma-border shadow-2xl flex flex-col animate-fade-in sm:translate-x-0">
            {/* Header do Drawer */}
            <div className="p-5 border-b border-[#242424] flex items-start justify-between bg-slate-800">
              <div className="flex gap-4">
                <div className="p-3 bg-slate-700 border border-sigma-border border border-[#facc15]/20 rounded-xl title-sigma-gold h-fit">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono title-sigma-gold bg-[#1c1c1c] px-2 py-0.5 rounded border border-[#2c2c2c]">
                      {documentoVisualizando.codigo_documento}
                    </span>
                    {documentoVisualizando.arquivado && (
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-400">
                         Arquivado
                       </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-white leading-tight pr-4">
                    {documentoVisualizando.titulo}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setModalVisualizarAberto(false)}
                className="p-2 text-[#888] hover:text-white rounded-xl hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do Drawer (Metadados + Iframe) */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Coluna Esquerda: Metadados e Ações */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[#242424] bg-[#0f172a] flex flex-col overflow-y-auto">
                <div className="p-5 space-y-6">
                  {/* Ação Principal */}
                  <button
                    onClick={() => handleDownloadArquivo(documentoVisualizando.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 text-sm font-extrabold rounded-xl shadow-lg transition-all hover:scale-[1.02]"
                  >
                    <Download className="w-4 h-4" /> Baixar Documento
                  </button>
                  {documentoVisualizando.pode_gerenciar && !isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-xl transition-all"
                    >
                      Editar Metadados
                    </button>
                  )}


                  
                  {isEditing ? (
                    <form onSubmit={handleSalvarEdicao} className="space-y-4 mt-4">
                      <h3 className="text-xs font-bold title-sigma-gold uppercase tracking-wider border-b border-slate-700 pb-2">
                        Modo de Edição
                      </h3>
                      <div>
                        <label className="block text-[10px] text-[#aaa] uppercase mb-1">Título</label>
                        <input 
                          type="text" 
                          value={formEdit.titulo} 
                          onChange={e => setFormEdit({...formEdit, titulo: e.target.value})}
                          className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-xs text-white" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#aaa] uppercase mb-1">Ementa</label>
                        <textarea 
                          value={formEdit.descricao_ementa} 
                          onChange={e => setFormEdit({...formEdit, descricao_ementa: e.target.value})}
                          className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-xs text-white" 
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">Cancelar</button>
                        <button type="submit" className="flex-1 py-2 bg-sigma-gold text-[#070F1E] font-bold rounded text-xs">Salvar</button>
                      </div>
                    </form>
                  ) : (
                    <>
                    {/* Informações */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-[#888] uppercase tracking-wider border-b border-sigma-border pb-2">
                      Detalhes
                    </h3>
                    
                    <div>
                      <span className="block text-[10px] text-[#666] uppercase mb-0.5">Autor / Emissor</span>
                      <span className="text-sm text-white font-medium">{documentoVisualizando.autor_nome}</span>
                      <span className="block text-xs text-[#aaa]">{documentoVisualizando.tipo_origem === 'LOJA' ? `Loja ${documentoVisualizando.loja_emissora_nome}` : 'Conselho Regional'}</span>
                    </div>

                    <div>
                      <span className="block text-[10px] text-[#666] uppercase mb-0.5">Data do Documento</span>
                      <span className="text-sm text-[#ccc] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 title-sigma-gold" /> {documentoVisualizando.data_documento}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[10px] text-[#666] uppercase mb-0.5">Tamanho</span>
                      <span className="text-sm text-[#ccc]">{formatarTamanho(documentoVisualizando.tamanho_bytes)}</span>
                    </div>

                    <div>
                      <span className="block text-[10px] text-[#666] uppercase mb-0.5">Categoria</span>
                      <span className="text-sm text-[#ccc]">{documentoVisualizando.categoria}</span>
                    </div>

                    {documentoVisualizando.descricao_ementa && (
                      <div>
                        <span className="block text-[10px] text-[#666] uppercase mb-1">Ementa / Descrição</span>
                        <p className="text-xs text-[#aaa] leading-relaxed bg-slate-800 p-3 rounded-lg border border-sigma-border">
                          {documentoVisualizando.descricao_ementa}
                        </p>
                      </div>
                    )}
                  </div>

                                    </>
                  )}
                  {/* Estatísticas (Downloads) */}
                  <div className="space-y-4 pt-4 border-t border-sigma-border">
                    <h3 className="text-xs font-bold text-[#888] uppercase tracking-wider">
                      Histórico / Interações
                    </h3>
                    <div className="flex items-center gap-3 bg-slate-800 border border-sigma-border p-3 rounded-xl">
                      <div className="p-2 bg-blue-950/40 rounded-lg">
                        <HardDriveDownload className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <span className="block text-lg font-bold text-white leading-none">
                          {documentoVisualizando.downloads_count}
                        </span>
                        <span className="text-[10px] text-[#777] uppercase">Downloads realizados</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Visualizador de PDF */}
              <div className="flex-1 bg-slate-800 relative h-[50vh] md:h-auto">
                <iframe
                  src={`${API_URL}/regional/${id}/documentos/${documentoVisualizando.id}/arquivo#toolbar=1`}
                  title={documentoVisualizando.titulo}
                  className="w-full h-full border-none"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PUBLICAR NOVO DOCUMENTO */}
      {/* ========================================================================= */}
      {modalPublicarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070e1c]/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border border-sigma-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#242424] flex items-center justify-between bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-700 border border-sigma-border border border-[#facc15]/20 rounded-xl title-sigma-gold">
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
            <div className="p-4 bg-[#0f172a] border-b border-[#242424] flex gap-3">
              <button
                type="button"
                onClick={() => setTipoPublicacao('GERAR')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  tipoPublicacao === 'GERAR'
                    ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow'
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
                    ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow'
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                        className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-pink-400 mb-1.5">Número da Loja</label>
                      <input
                        type="text"
                        placeholder="Ex: 42"
                        value={formGerar.loja_emissora_numero}
                        onChange={(e) => setFormGerar({...formGerar, loja_emissora_numero: e.target.value})}
                        className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
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
                    className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data Oficial do Ato</label>
                    <CampoData
                      value={formGerar.data_documento}
                      onChange={(v) => setFormGerar({...formGerar, data_documento: v})}
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tem-expiracao-gerar"
                    checked={temExpiracaoGerar}
                    onChange={(e) => { setTemExpiracaoGerar(e.target.checked); if (!e.target.checked) setFormGerar({...formGerar, data_expiracao: ''}); }}
                    className="w-4 h-4 accent-[#facc15] bg-slate-700 border-[#303030] rounded"
                  />
                  <label htmlFor="tem-expiracao-gerar" className="text-xs font-medium text-[#ccc] cursor-pointer">
                    Expira automaticamente numa data (arquivamento automático)
                  </label>
                </div>
                {temExpiracaoGerar && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data de expiração</label>
                    <CampoData
                      value={formGerar.data_expiracao}
                      onChange={(v) => setFormGerar({...formGerar, data_expiracao: v})}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                    <p className="text-[10px] text-[#777] mt-1">Depois dessa data, o sistema arquiva este documento/convite automaticamente.</p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Ementa / Resumo</label>
                  <input
                    type="text"
                    placeholder="Breve resumo do conteúdo da prancha..."
                    value={formGerar.descricao_ementa}
                    onChange={(e) => setFormGerar({...formGerar, descricao_ementa: e.target.value})}
                    className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15] font-serif leading-relaxed"
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
                    className="px-5 py-2.5 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                    className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
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
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data Oficial do Ato</label>
                    <CampoData
                      value={formUpload.data_documento}
                      onChange={(v) => setFormUpload({...formUpload, data_documento: v})}
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tem-expiracao-upload"
                    checked={temExpiracaoUpload}
                    onChange={(e) => { setTemExpiracaoUpload(e.target.checked); if (!e.target.checked) setFormUpload({...formUpload, data_expiracao: ''}); }}
                    className="w-4 h-4 accent-[#facc15] bg-slate-700 border-[#303030] rounded"
                  />
                  <label htmlFor="tem-expiracao-upload" className="text-xs font-medium text-[#ccc] cursor-pointer">
                    Expira automaticamente numa data (arquivamento automático)
                  </label>
                </div>
                {temExpiracaoUpload && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Data de expiração</label>
                    <CampoData
                      value={formUpload.data_expiracao}
                      onChange={(v) => setFormUpload({...formUpload, data_expiracao: v})}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                    <p className="text-[10px] text-[#777] mt-1">Depois dessa data, o sistema arquiva este documento/convite automaticamente.</p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Ementa / Resumo</label>
                  <input
                    type="text"
                    placeholder="Breve descrição do teor do arquivo..."
                    value={formUpload.descricao_ementa}
                    onChange={(e) => setFormUpload({...formUpload, descricao_ementa: e.target.value})}
                    className="w-full bg-slate-700 border border-[#303030] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#888] mb-1.5">Arquivo do Documento (.PDF)</label>
                  <div className="border-2 border-dashed border-[#303030] hover:border-[#facc15] rounded-xl p-6 text-center cursor-pointer bg-slate-700 transition-colors">
                    <input
                      type="file"
                      required
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setArquivoUpload(e.target.files[0]);
                        }
                      }}
                      className="w-full text-xs text-[#aaa] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sigma-gold text-[#070F1E] shadow-md file:text-black hover:file:bg-[#eab308] cursor-pointer"
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
                    className="px-5 py-2.5 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
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
