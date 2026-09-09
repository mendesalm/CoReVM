// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  BarChart3, Users, Landmark, Vote, Download, FileText,
  ShieldCheck, CheckCircle2, Clock, AlertTriangle, ArrowLeft,
  Search, Award, Layers,
  Building, BookOpen, UserCheck, Activity, Loader2
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface KpisConsolidado {
  total_lojas: number;
  total_votacoes: number;
  total_votos_registrados: number;
  quorum_medio: number;
  total_admissoes: number;
  admissoes_concluidas: number;
  admissoes_andamento: number;
  total_consideracoes: number;
  total_ativos_patrimonio: number;
  total_ativos_disponiveis: number;
  total_ativos_emprestados: number;
  bens_solidarios_geral: number;
  total_cautelas: number;
  cautelas_ativas: number;
  cautelas_atrasadas: number;
  total_documentos: number;
  total_downloads: number;
  indice_engajamento_regional: number;
}

interface DistribuicaoRito {
  rito: string;
  quantidade: number;
  percentual: number;
}

interface RankingLoja {
  id: string;
  nome: string;
  numero: string;
  rito: string;
  cidade: string;
  votos_computados: number;
  total_votacoes: number;
  percentual_participacao: number;
  status_label: string;
  bens_solidarios_count: number;
  cautelas_ativas_count: number;
}

interface MembroDiretoria {
  id: string;
  cargo: string;
  cargo_codigo: string;
  usuario_id: string;
  nome: string;
  cim: string;
  email: string;
  telefone: string;
  inicio_mandato: string;
  termino_mandato: string;
}

interface LojaColegiado {
  loja_id: string;
  nome: string;
  numero: string;
  rito: string;
  cidade: string;
  data_filiacao: string;
  status: string;
  vm_nome: string;
  vm_cim: string;
  vm_email: string;
  vm_telefone: string;
  suplente_nome: string;
  suplente_email: string;
  suplente_telefone: string;
}

interface ItemPatrimonioRelatorio {
  id: string;
  codigo_tombamento: string;
  nome: string;
  descricao: string;
  categoria: string;
  tipo_propriedade: string;
  loja_proprietaria_nome: string;
  quantidade_total: number;
  quantidade_disponivel: number;
  quantidade_emprestada: number;
  localizacao_fisica: string;
  estado_conservacao: string;
  permite_emprestimo: boolean;
  permite_locacao: boolean;
  taxa_locacao_estimada: number;
}

interface EmprestimoRelatorio {
  id: string;
  item_nome: string;
  item_codigo: string;
  item_categoria: string;
  loja_solicitante_nome: string;
  loja_solicitante_numero: string;
  beneficiario_final: string;
  responsavel_retirada_nome: string;
  responsavel_retirada_cargo: string;
  responsavel_retirada_contato: string;
  responsavel_entrega_nome: string;
  data_retirada: string;
  data_prevista_devolucao: string;
  data_efetiva_devolucao?: string | null;
  quantidade: number;
  status: string;
  atrasado: boolean;
  observacoes: string;
}

export const PaginaRelatorios: React.FC = () => {
  const { id: regiaoId } = useParams<{ id: string }>();

  // Estado das Abas: 'visao-geral' | 'integrantes' | 'patrimonio' | 'quorum'
  const [abaAtiva, setAbaAtiva] = useState<'visao-geral' | 'integrantes' | 'patrimonio' | 'quorum'>('visao-geral');

  // Simulação de Usuário e RBAC
  const [activeUserId, setActiveUserId] = useState('CIM_12345_PRESIDENTE');
  const [userContext, setUserContext] = useState<any>({
    usuario_id: activeUserId,
    role: 'PRESIDENTE',
    is_diretoria: true,
    loja_id: null
  });

  // Dados dos Relatórios
  const [kpis, setKpis] = useState<KpisConsolidado | null>(null);
  const [distribuicaoRitos, setDistribuicaoRitos] = useState<DistribuicaoRito[]>([]);
  const [rankingLojas, setRankingLojas] = useState<RankingLoja[]>([]);
  const [conselhoNome, setConselhoNome] = useState('Conselho Regional de Veneráveis Mestres');

  const [mesaDiretora, setMesaDiretora] = useState<MembroDiretoria[]>([]);
  const [lojasColegiado, setLojasColegiado] = useState<LojaColegiado[]>([]);

  const [resumoPatrimonio, setResumoPatrimonio] = useState<any>(null);
  const [itensPatrimonio, setItensPatrimonio] = useState<ItemPatrimonioRelatorio[]>([]);
  const [emprestimosPatrimonio, setEmprestimosPatrimonio] = useState<EmprestimoRelatorio[]>([]);

  // Estados de Controle de UI
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);

  // Filtros Locais
  const [buscaIntegrantes, setBuscaIntegrantes] = useState('');
  const [filtroRito, setFiltroRito] = useState('TODOS');
  const [buscaPatrimonio, setBuscaPatrimonio] = useState('');
  const [filtroCategoriaPatrimonio, setFiltroCategoriaPatrimonio] = useState('TODAS');

  // Carregar Contexto de Permissão
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

  // Carregar Dados Conforme Aba Ativa ou Inicialmente
  const carregarDados = async () => {
    if (!regiaoId) return;
    setLoading(true);
    setErro('');
    try {
      const headers = { 'X-User-ID': activeUserId };

      // 1. Relatório Consolidado
      const resConsol = await axios.get(`${API_URL}/regional/${regiaoId}/relatorios/consolidado`, { headers });
      setKpis(resConsol.data.kpis);
      setDistribuicaoRitos(resConsol.data.distribuicao_ritos || []);
      setRankingLojas(resConsol.data.ranking_lojas || []);
      if (resConsol.data.conselho?.nome) {
        setConselhoNome(resConsol.data.conselho.nome);
      }

      // 2. Relatório de Integrantes
      const resInt = await axios.get(`${API_URL}/regional/${regiaoId}/relatorios/integrantes`, { headers });
      setMesaDiretora(resInt.data.mesa_diretora || []);
      setLojasColegiado(resInt.data.lojas || []);

      // 3. Relatório de Patrimônio
      const resPat = await axios.get(`${API_URL}/regional/${regiaoId}/relatorios/patrimonio`, { headers });
      setResumoPatrimonio(resPat.data.resumo || null);
      setItensPatrimonio(resPat.data.itens || []);
      setEmprestimosPatrimonio(resPat.data.emprestimos || []);

    } catch (err: any) {
      console.error("Erro ao carregar dados dos relatórios:", err);
      setErro(err.response?.data?.detail || "Erro ao conectar com a central de relatórios de gestão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [regiaoId, activeUserId]);

  // Exportação de PDF
  const handleExportarPdf = async (tipo: 'executivo' | 'integrantes' | 'patrimonio') => {
    if (!regiaoId) return;
    setBaixandoPdf(tipo);
    setErro('');
    try {
      const res = await axios.get(`${API_URL}/regional/${regiaoId}/relatorios/exportar-pdf?tipo=${tipo}`, {
        headers: { 'X-User-ID': activeUserId },
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const nomes = {
        executivo: 'Relatorio_Executivo_Conselho.pdf',
        integrantes: 'Quadro_Integrantes_Conselho.pdf',
        patrimonio: 'Balanco_Patrimonial_Conselho.pdf'
      };
      link.setAttribute('download', nomes[tipo] || `Relatorio_${tipo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSucesso(`Relatório oficial em PDF (${tipo}) gerado e baixado com sucesso!`);
      setTimeout(() => setSucesso(''), 5000);
    } catch (err: any) {
      console.error("Erro ao exportar PDF:", err);
      setErro("Falha ao gerar documento PDF no servidor.");
    } finally {
      setBaixandoPdf(null);
    }
  };

  // Filtragem de Integrantes
  const lojasFiltradas = lojasColegiado.filter(l => {
    const matchBusca = 
      l.nome.toLowerCase().includes(buscaIntegrantes.toLowerCase()) ||
      l.numero.includes(buscaIntegrantes) ||
      l.vm_nome.toLowerCase().includes(buscaIntegrantes.toLowerCase()) ||
      l.suplente_nome.toLowerCase().includes(buscaIntegrantes.toLowerCase());
    
    const matchRito = filtroRito === 'TODOS' || l.rito.toUpperCase() === filtroRito.toUpperCase();
    return matchBusca && matchRito;
  });

  // Filtragem de Patrimônio
  const itensPatrimonioFiltrados = itensPatrimonio.filter(item => {
    const matchBusca = 
      item.nome.toLowerCase().includes(buscaPatrimonio.toLowerCase()) ||
      item.codigo_tombamento.toLowerCase().includes(buscaPatrimonio.toLowerCase()) ||
      item.localizacao_fisica.toLowerCase().includes(buscaPatrimonio.toLowerCase());
    
    const matchCat = filtroCategoriaPatrimonio === 'TODAS' || item.categoria === filtroCategoriaPatrimonio;
    return matchBusca && matchCat;
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
                MÓDULO DE GESTÃO & GOVERNANÇA
              </span>
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-gray-400">{conselhoNome}</span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2 mt-0.5">
              <BarChart3 className="w-5 h-5 text-macaonico-dourado" />
              Relatórios de Gestão e Inteligência Regional
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
            <option value="VM_2">VM Roosevelt nº 1 (Membro do Colegiado)</option>
            <option value="VM_31">VM Independência nº 40 (Membro do Colegiado)</option>
            <option value="VM_60">VM São João da Escócia nº 78 (Membro do Colegiado)</option>
          </select>
        </div>
      </div>

      {/* Alertas de Notificação */}
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

      {/* 2. BARRA DE EXPORTAÇÃO OFICIAL REPORTLAB */}
      <div className="bg-gradient-to-r from-[#141414] via-[#181818] to-[#141414] border border-[#2a2a2a] p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Auditoria Canônica e Exportação Oficial</h3>
            <p className="text-xs text-gray-400">Emita demonstrativos chancelados em PDF para prestação de contas e arquivo institucional.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => handleExportarPdf('executivo')}
            disabled={baixandoPdf !== null}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 py-2 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] hover:border-amber-500/40 text-xs font-semibold text-gray-200 rounded transition-colors disabled:opacity-50"
            title="Exportar Relatório Executivo Geral em PDF"
          >
            {baixandoPdf === 'executivo' ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Download className="w-4 h-4 text-amber-400" />}
            <span>PDF Executivo</span>
          </button>

          <button
            onClick={() => handleExportarPdf('integrantes')}
            disabled={baixandoPdf !== null}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 py-2 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] hover:border-amber-500/40 text-xs font-semibold text-gray-200 rounded transition-colors disabled:opacity-50"
            title="Exportar Livro de Matrícula e Relação de VMs em PDF"
          >
            {baixandoPdf === 'integrantes' ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Users className="w-4 h-4 text-amber-400" />}
            <span>PDF Integrantes</span>
          </button>

          <button
            onClick={() => handleExportarPdf('patrimonio')}
            disabled={baixandoPdf !== null}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 py-2 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] hover:border-amber-500/40 text-xs font-semibold text-gray-200 rounded transition-colors disabled:opacity-50"
            title="Exportar Balanço Patrimonial e Cautelas em PDF"
          >
            {baixandoPdf === 'patrimonio' ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Landmark className="w-4 h-4 text-amber-400" />}
            <span>PDF Patrimônio</span>
          </button>
        </div>
      </div>

      {/* 3. NAVEGAÇÃO POR ABAS */}
      <div className="flex border-b border-[#222] space-x-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setAbaAtiva('visao-geral')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            abaAtiva === 'visao-geral'
              ? 'border-macaonico-dourado text-macaonico-dourado bg-amber-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Visão Geral & Inteligência</span>
        </button>

        <button
          onClick={() => setAbaAtiva('integrantes')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            abaAtiva === 'integrantes'
              ? 'border-macaonico-dourado text-macaonico-dourado bg-amber-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Integrantes do Colegiado ({lojasColegiado.length})</span>
        </button>

        <button
          onClick={() => setAbaAtiva('patrimonio')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            abaAtiva === 'patrimonio'
              ? 'border-macaonico-dourado text-macaonico-dourado bg-amber-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Patrimônio & Cautelas</span>
        </button>

        <button
          onClick={() => setAbaAtiva('quorum')}
          className={`flex items-center space-x-2 px-4 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            abaAtiva === 'quorum'
              ? 'border-macaonico-dourado text-macaonico-dourado bg-amber-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
          }`}
        >
          <Vote className="w-4 h-4" />
          <span>Quórum & Assiduidade</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-macaonico-dourado animate-spin" />
          <p className="text-sm text-gray-400">Compilando dados de governança e auditoria regional...</p>
        </div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* ABA 1: VISÃO GERAL & INTELIGÊNCIA REGIONAL */}
          {/* ================================================================= */}
          {abaAtiva === 'visao-geral' && kpis && (
            <div className="space-y-6">
              {/* Card Destaque: Índice de Engajamento Regional (IER) */}
              <div className="bg-[#121212] border border-[#222] p-6 rounded-lg relative overflow-hidden">
                <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                  <div className="lg:col-span-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        INDICADOR-CHAVE DE PERFORMANCE
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-400">Ponderação Algorítmica</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Índice de Engajamento Regional (IER)</h2>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Métrica unificada que mede a sinergia e cooperação entre as 17 Lojas Jurisdicionadas.
                      Consolida assiduidade em votações secretas, interação em prévias sindicantes e circulação de bens hospitalares.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Presença Deliberativa: <b>{kpis.quorum_medio}%</b></span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        <span>Mural Sindicante: <b>{kpis.admissoes_concluidas}/{kpis.total_admissoes}</b></span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>Giro de Hospitalaria: <b>{kpis.total_ativos_emprestados} bens em uso</b></span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#181818] border border-[#2a2a2a] p-5 rounded-lg flex flex-col items-center justify-center text-center space-y-2">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">IER Consolidado</div>
                    <div className="text-4xl font-black text-amber-400 flex items-baseline">
                      {kpis.indice_engajamento_regional}
                      <span className="text-xl font-normal text-gray-400 ml-1">%</span>
                    </div>
                    <div className="w-full bg-[#262626] rounded-full h-2.5 mt-1 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-yellow-400 h-2.5 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.max(5, kpis.indice_engajamento_regional))}%` }}
                      />
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">
                      {kpis.indice_engajamento_regional >= 70 ? 'Governança Ativa e Estável' : 'Engajamento Moderado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid de 6 KPIs Globais */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Lojas Jurisdicionadas</span>
                    <Building className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.total_lojas}</div>
                  <div className="text-[10px] text-emerald-400">100% Federadas</div>
                </div>

                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Quórum Médio</span>
                    <Vote className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.quorum_medio}%</div>
                  <div className="text-[10px] text-gray-400">{kpis.total_votacoes} deliberações</div>
                </div>

                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Prévias de Admissão</span>
                    <UserCheck className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.total_admissoes}</div>
                  <div className="text-[10px] text-purple-400">{kpis.total_consideracoes} pareceres</div>
                </div>

                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Acervo Patrimonial</span>
                    <Landmark className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.total_ativos_patrimonio}</div>
                  <div className="text-[10px] text-gray-400">{kpis.total_ativos_disponiveis} em sede</div>
                </div>

                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Cautelas Ativas</span>
                    <Clock className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.cautelas_ativas}</div>
                  <div className={`text-[10px] ${kpis.cautelas_atrasadas > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {kpis.cautelas_atrasadas} com atraso
                  </div>
                </div>

                <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-gray-400 text-xs">
                    <span>Atas e Decretos</span>
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpis.total_documentos}</div>
                  <div className="text-[10px] text-gray-400">{kpis.total_downloads} acessos</div>
                </div>
              </div>

              {/* Distribuição por Rito & Top 5 Assiduidade */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribuição por Rito */}
                <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-macaonico-dourado" />
                      Distribuição Litúrgica por Rito
                    </h3>
                    <span className="text-xs text-gray-400">{distribuicaoRitos.length} Ritos Praticados</span>
                  </div>

                  <div className="space-y-3">
                    {distribuicaoRitos.map((r) => (
                      <div key={r.rito} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-gray-200">{r.rito}</span>
                          <span className="text-gray-400">{r.quantidade} {r.quantidade === 1 ? 'Loja' : 'Lojas'} ({r.percentual}%)</span>
                        </div>
                        <div className="w-full bg-[#1e1e1e] rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-amber-500 h-2 rounded-full"
                            style={{ width: `${r.percentual}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500 pt-2 border-t border-[#1e1e1e]">
                    O Conselho Regional preserva a harmonia ecumênica respeitando a soberania ritualística de todas as potências e oficinas federadas.
                  </p>
                </div>

                {/* Resumo de Participação das Lojas */}
                <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-macaonico-dourado" />
                      Lojas com Maior Engajamento
                    </h3>
                    <button 
                      onClick={() => setAbaAtiva('quorum')}
                      className="text-xs text-macaonico-dourado hover:underline flex items-center gap-1"
                    >
                      Ver Ranking Completo ({rankingLojas.length})
                    </button>
                  </div>

                  <div className="space-y-2">
                    {rankingLojas.slice(0, 5).map((l, index) => (
                      <div key={l.id} className="flex items-center justify-between p-2.5 bg-[#181818] border border-[#242424] rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? 'bg-amber-500 text-black' : 
                            index === 1 ? 'bg-gray-300 text-black' : 
                            index === 2 ? 'bg-amber-700 text-white' : 'bg-[#222] text-gray-400'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{l.nome} nº {l.numero}</div>
                            <div className="text-[10px] text-gray-400">{l.rito} • {l.votos_computados} votos registrados</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-emerald-400">{l.percentual_participacao}%</div>
                          <div className="text-[10px] text-gray-500">{l.status_label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ABA 2: INTEGRANTES DO COLEGIADO (MESA DIRETORA + 17 LOJAS) */}
          {/* ================================================================= */}
          {abaAtiva === 'integrantes' && (
            <div className="space-y-6">
              {/* 1. MESA DIRETORA EXECUTIVA */}
              <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-macaonico-dourado" />
                      Mesa Diretora Executiva em Exercício
                    </h2>
                    <p className="text-xs text-gray-400">Oficiais eleitos para a condução dos trabalhos administrativos do Conselho Regional.</p>
                  </div>
                  <span className="text-xs text-amber-400 font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 self-start">
                    Mandato 2024–2025
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mesaDiretora.map((m) => (
                    <div key={m.id} className="bg-[#161616] border border-[#262626] p-4 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">{m.cargo}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          CIM: {m.cim}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white">{m.nome}</div>
                      <div className="space-y-1 text-xs text-gray-400 pt-1 border-t border-[#222]">
                        <div className="flex justify-between">
                          <span>E-mail:</span>
                          <span className="text-gray-300 truncate max-w-[180px]">{m.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Telefone:</span>
                          <span className="text-gray-300">{m.telefone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Vigência:</span>
                          <span className="text-gray-300">{m.inicio_mandato} a {m.termino_mandato}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. QUADRO DAS 17 LOJAS JURISDICIONADAS E SEUS VENERÁVEIS MESTRES */}
              <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-macaonico-dourado" />
                      Quadro de Veneráveis Mestres e Suplentes ({lojasFiltradas.length} de {lojasColegiado.length})
                    </h2>
                    <p className="text-xs text-gray-400">Relação nominal dos representantes natos com direito a voz e voto nas sessões do Conselho.</p>
                  </div>

                  {/* Filtros e Busca */}
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        placeholder="Buscar Loja, VM ou Suplente..."
                        value={buscaIntegrantes}
                        onChange={(e) => setBuscaIntegrantes(e.target.value)}
                        className="w-full bg-[#080808] border border-[#333] text-xs text-gray-200 rounded pl-9 pr-3 py-2 focus:border-macaonico-dourado focus:outline-none"
                      />
                    </div>

                    <select
                      value={filtroRito}
                      onChange={(e) => setFiltroRito(e.target.value)}
                      className="bg-[#080808] border border-[#333] text-xs text-gray-200 rounded px-3 py-2 focus:border-macaonico-dourado focus:outline-none"
                    >
                      <option value="TODOS">Todos os Ritos</option>
                      <option value="REAA">REAA</option>
                      <option value="Rito Moderno">Rito Moderno</option>
                      <option value="Rito Brasileiro">Rito Brasileiro</option>
                      <option value="York">York</option>
                      <option value="Schröder">Schröder</option>
                      <option value="Adonhiramita">Adonhiramita</option>
                    </select>
                  </div>
                </div>

                {/* Tabela de Lojas e Representantes */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616] text-xs text-gray-400">
                        <th className="p-3 font-semibold">Loja Jurisdicionada</th>
                        <th className="p-3 font-semibold">Rito / Oriente</th>
                        <th className="p-3 font-semibold">Venerável Mestre (Titular)</th>
                        <th className="p-3 font-semibold">Suplente (1º Vigilante)</th>
                        <th className="p-3 font-semibold">Contatos Oficiais</th>
                        <th className="p-3 font-semibold text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e] text-xs">
                      {lojasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-500">
                            Nenhuma loja encontrada para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        lojasFiltradas.map((loja) => (
                          <tr key={loja.loja_id} className="hover:bg-[#161616] transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-macaonico-dourado" />
                                {loja.nome}
                              </div>
                              <div className="text-[11px] text-gray-400">Nº {loja.numero} • F过渡iada em {loja.data_filiacao}</div>
                            </td>

                            <td className="p-3">
                              <div className="text-gray-200 font-medium">{loja.rito}</div>
                              <div className="text-[11px] text-gray-400">{loja.cidade} - GO</div>
                            </td>

                            <td className="p-3">
                              <div className="font-semibold text-white">{loja.vm_nome}</div>
                              <div className="text-[11px] text-blue-400">CIM: {loja.vm_cim}</div>
                            </td>

                            <td className="p-3">
                              <div className="font-medium text-gray-300">{loja.suplente_nome}</div>
                              <div className="text-[11px] text-gray-500">Suplente Nato</div>
                            </td>

                            <td className="p-3">
                              <div className="text-gray-300 truncate max-w-[170px]">{loja.vm_email}</div>
                              <div className="text-[11px] text-gray-400">{loja.vm_telefone}</div>
                            </td>

                            <td className="p-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                                {loja.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ABA 3: PATRIMÔNIO & CAUTELAS */}
          {/* ================================================================= */}
          {abaAtiva === 'patrimonio' && (
            <div className="space-y-6">
              {/* Resumo de Ativos */}
              {resumoPatrimonio && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                    <div className="text-xs text-gray-400">Total de Bens Tombados</div>
                    <div className="text-2xl font-bold text-white">{resumoPatrimonio.total_itens_cadastrados} itens</div>
                    <div className="text-[10px] text-amber-400">{resumoPatrimonio.total_unidades_acervo} unidades físicas</div>
                  </div>

                  <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                    <div className="text-xs text-gray-400">Unidades Disponíveis</div>
                    <div className="text-2xl font-bold text-emerald-400">{resumoPatrimonio.unidades_disponiveis}</div>
                    <div className="text-[10px] text-gray-400">Prontos para retirada imediata</div>
                  </div>

                  <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                    <div className="text-xs text-gray-400">Unidades em Uso Fraterno</div>
                    <div className="text-2xl font-bold text-blue-400">{resumoPatrimonio.unidades_em_uso}</div>
                    <div className="text-[10px] text-blue-400">Taxa de Ocupação: {resumoPatrimonio.taxa_ocupacao}%</div>
                  </div>

                  <div className="bg-[#121212] border border-[#222] p-4 rounded-lg space-y-1">
                    <div className="text-xs text-gray-400">Termos de Cautela Ativos</div>
                    <div className="text-2xl font-bold text-white">{resumoPatrimonio.cautelas_ativas}</div>
                    <div className={`text-[10px] ${resumoPatrimonio.cautelas_atrasadas > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>
                      {resumoPatrimonio.cautelas_atrasadas} devoluções vencidas
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela de Bens Tombados */}
              <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Landmark className="w-5 h-5 text-macaonico-dourado" />
                      Inventário Analítico de Bens do Acervo Regional
                    </h3>
                    <p className="text-xs text-gray-400">Relação completa de ativos próprios e bens cadastrados na Rede Solidária pelas Lojas.</p>
                  </div>

                  {/* Filtros */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        placeholder="Buscar por placa, nome..."
                        value={buscaPatrimonio}
                        onChange={(e) => setBuscaPatrimonio(e.target.value)}
                        className="w-full bg-[#080808] border border-[#333] text-xs text-gray-200 rounded pl-9 pr-3 py-2 focus:border-macaonico-dourado focus:outline-none"
                      />
                    </div>

                    <select
                      value={filtroCategoriaPatrimonio}
                      onChange={(e) => setFiltroCategoriaPatrimonio(e.target.value)}
                      className="bg-[#080808] border border-[#333] text-xs text-gray-200 rounded px-3 py-2 focus:border-macaonico-dourado focus:outline-none"
                    >
                      <option value="TODAS">Todas as Categorias</option>
                      <option value="HOSPITALARIA">Hospitalaria / Saúde</option>
                      <option value="MOBILIARIO">Mobiliário</option>
                      <option value="EQUIPAMENTO">Equipamentos</option>
                      <option value="VEICULO">Veículos</option>
                      <option value="OUTROS">Outros</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616] text-xs text-gray-400">
                        <th className="p-3 font-semibold">Plaqueta / Código</th>
                        <th className="p-3 font-semibold">Descrição do Bem</th>
                        <th className="p-3 font-semibold">Categoria</th>
                        <th className="p-3 font-semibold">Propriedade</th>
                        <th className="p-3 font-semibold">Quantidade</th>
                        <th className="p-3 font-semibold">Localização Física</th>
                        <th className="p-3 font-semibold text-right">Conservação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e] text-xs">
                      {itensPatrimonioFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-500">
                            Nenhum bem patrimonial encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        itensPatrimonioFiltrados.map((item) => (
                          <tr key={item.id} className="hover:bg-[#161616] transition-colors">
                            <td className="p-3 font-mono text-amber-400 font-bold">
                              {item.codigo_tombamento}
                            </td>
                            <td className="p-3 font-semibold text-white">
                              {item.nome}
                            </td>
                            <td className="p-3 text-gray-300">
                              {item.categoria}
                            </td>
                            <td className="p-3">
                              {item.tipo_propriedade === 'LOJA' ? (
                                <span className="text-purple-400 font-medium">Rede Solidária ({item.loja_proprietaria_nome})</span>
                              ) : (
                                <span className="text-amber-400 font-medium">Conselho Regional</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-white">{item.quantidade_disponivel}</span>
                              <span className="text-gray-500"> / {item.quantidade_total} unid.</span>
                            </td>
                            <td className="p-3 text-gray-400">
                              {item.localizacao_fisica}
                            </td>
                            <td className="p-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-[#222] text-gray-300 text-[10px] font-semibold border border-[#333]">
                                {item.estado_conservacao}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabela de Cautelas / Empréstimos */}
              <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-macaonico-dourado" />
                    Termos de Cautela e Comodatos em Andamento
                  </h3>
                  <span className="text-xs text-gray-400">Total: {emprestimosPatrimonio.length} registros</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616] text-xs text-gray-400">
                        <th className="p-3 font-semibold">Ativo Emprestado</th>
                        <th className="p-3 font-semibold">Loja Solicitante</th>
                        <th className="p-3 font-semibold">Responsável / Beneficiário</th>
                        <th className="p-3 font-semibold">Retirada</th>
                        <th className="p-3 font-semibold">Devolução Prevista</th>
                        <th className="p-3 font-semibold text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e] text-xs">
                      {emprestimosPatrimonio.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-500">
                            Nenhum termo de cautela registrado no momento.
                          </td>
                        </tr>
                      ) : (
                        emprestimosPatrimonio.map((emp) => (
                          <tr key={emp.id} className="hover:bg-[#161616] transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-white">{emp.item_nome}</div>
                              <div className="text-[11px] text-gray-400 font-mono">{emp.item_codigo} • {emp.quantidade} unid.</div>
                            </td>

                            <td className="p-3">
                              <div className="font-semibold text-gray-200">{emp.loja_solicitante_nome}</div>
                              <div className="text-[11px] text-gray-400">Nº {emp.loja_solicitante_numero}</div>
                            </td>

                            <td className="p-3">
                              <div className="text-gray-300 font-medium">{emp.responsavel_retirada_nome}</div>
                              <div className="text-[11px] text-gray-500">Beneficiário: {emp.beneficiario_final}</div>
                            </td>

                            <td className="p-3 text-gray-400">
                              {emp.data_retirada}
                            </td>

                            <td className="p-3">
                              <div className={`font-semibold ${emp.atrasado ? 'text-red-400' : 'text-gray-200'}`}>
                                {emp.data_prevista_devolucao}
                              </div>
                            </td>

                            <td className="p-3 text-right">
                              {emp.status === 'CONCLUIDO' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                                  Devolvido
                                </span>
                              ) : emp.atrasado ? (
                                <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold animate-pulse">
                                  VENCIDO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                                  Em Aberto
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ABA 4: QUÓRUM & ASSIDUIDADE */}
          {/* ================================================================= */}
          {abaAtiva === 'quorum' && (
            <div className="space-y-6">
              <div className="bg-[#121212] border border-[#222] p-5 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#222] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Award className="w-5 h-5 text-macaonico-dourado" />
                      Ranking Oficial de Assiduidade e Governança das Lojas
                    </h2>
                    <p className="text-xs text-gray-400">
                      Auditoria de presença das 17 Lojas Jurisdicionadas em votações e deliberações plenárias do Conselho.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                      Total: {kpis?.total_votacoes || 0} Deliberações
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] bg-[#161616] text-xs text-gray-400">
                        <th className="p-3 font-semibold text-center w-16">Posição</th>
                        <th className="p-3 font-semibold">Loja Jurisdicionada</th>
                        <th className="p-3 font-semibold">Rito</th>
                        <th className="p-3 font-semibold">Votos Computados</th>
                        <th className="p-3 font-semibold">Participação</th>
                        <th className="p-3 font-semibold">Apoio Solidário</th>
                        <th className="p-3 font-semibold text-right">Classificação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e] text-xs">
                      {rankingLojas.map((loja, idx) => (
                        <tr key={loja.id} className="hover:bg-[#161616] transition-colors">
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                              idx === 0 ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30' :
                              idx === 1 ? 'bg-gray-300 text-black' :
                              idx === 2 ? 'bg-amber-700 text-white' : 'bg-[#222] text-gray-400'
                            }`}>
                              {idx + 1}º
                            </span>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-white">{loja.nome}</div>
                            <div className="text-[11px] text-gray-400">Nº {loja.numero} • {loja.cidade}</div>
                          </td>

                          <td className="p-3 text-gray-300">
                            {loja.rito}
                          </td>

                          <td className="p-3">
                            <span className="font-bold text-white">{loja.votos_computados}</span>
                            <span className="text-gray-500"> / {loja.total_votacoes} votações</span>
                          </td>

                          <td className="p-3">
                            <div className="space-y-1 w-36">
                              <div className="flex justify-between text-[11px]">
                                <span className="font-bold text-white">{loja.percentual_participacao}%</span>
                              </div>
                              <div className="w-full bg-[#222] rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-1.5 rounded-full ${
                                    loja.percentual_participacao >= 80 ? 'bg-emerald-400' :
                                    loja.percentual_participacao >= 50 ? 'bg-amber-400' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${loja.percentual_participacao}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-gray-300">
                            {loja.bens_solidarios_count > 0 ? (
                              <span className="text-purple-400 font-semibold">{loja.bens_solidarios_count} bens na rede</span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              loja.status_label === 'Excelente' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              loja.status_label === 'Regular' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {loja.status_label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PaginaRelatorios;
