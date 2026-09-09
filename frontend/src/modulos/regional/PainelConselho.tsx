// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { 
  Building2, FileText, ShieldCheck, Loader2, 
  Award, Calendar, Bell, Pin, Trash2, Plus, ArrowRight, 
  CheckCircle2, AlertTriangle 
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const [conselho, setConselho] = useState<any>(null);
  const [diretoria, setDiretoria] = useState<any[]>([]);
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

  // Mural de Avisos e Notificações
  const [avisos, setAvisos] = useState<any[]>([]);
  const [showNovoAvisoModal, setShowNovoAvisoModal] = useState(false);
  const [salvandoAviso, setSalvandoAviso] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [avisoForm, setAvisoForm] = useState({
    titulo: '',
    conteudo: '',
    tipo: 'AVISO',
    nivel: 'BAIXO',
    data_validade: '',
    fixado: false
  });

  // Carregar dados completos do conselho, diretoria e avisos
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const headers = { 'X-User-Id': activeUserId };

      // 1. Contexto do usuário logado (RBAC)
      const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
      setUserContext(userRes.data);

      // 2. Dados da Região, Diretoria e Avisos
      const [resDashboard, resDiretoria, resAvisos] = await Promise.all([
        axios.get(`${API_URL}/regional/${id}/dashboard`, { headers }),
        axios.get(`${API_URL}/regional/${id}/diretoria`, { headers }),
        axios.get(`${API_URL}/regional/${id}/avisos`, { headers })
      ]);

      const data = resDashboard.data;
      setDiretoria(resDiretoria.data || []);
      setAvisos(resAvisos.data || []);

      if (data.lojas && data.lojas.length > 0) {
        const ids = data.lojas.map((l: any) => parseInt(l.loja_id)).filter((n: number) => !isNaN(n));
        if (ids.length > 0) {
          const vmStatusRes = await axios.post(`${API_URL}/integracao/lojas/status_vm`, ids);
          data.lojas = data.lojas.map((l: any) => ({
            ...l,
            hasVm: vmStatusRes.data[l.loja_id]
          }));
        }
      }
      setConselho(data);
    } catch (err: any) {
      setErro(err.response?.data?.detail || "Acesso negado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDashboard();
  }, [id, activeUserId, reloadKey]);

  // Publicar Novo Aviso
  const handleCriarAviso = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = avisoForm.conteudo.trim().split(/\s+/).filter(Boolean);
    if (words.length > 200) {
      alert(`O texto excede o limite máximo permitido de 200 palavras (atualmente com ${words.length} palavras). Por favor, sintetize a mensagem.`);
      return;
    }

    setSalvandoAviso(true);
    try {
      await axios.post(`${API_URL}/regional/${id}/avisos`, {
        ...avisoForm,
        data_validade: avisoForm.data_validade || null
      }, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert('Aviso publicado com sucesso no mural do conselho!');
      setShowNovoAvisoModal(false);
      setAvisoForm({ titulo: '', conteudo: '', tipo: 'AVISO', nivel: 'BAIXO', data_validade: '', fixado: false });
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao publicar aviso');
    } finally {
      setSalvandoAviso(false);
    }
  };

  // Excluir Aviso (Deleção Visual para membros, com opção de Hard Delete para SuperAdmin)
  const handleExcluirAviso = async (avisoId: string) => {
    let hardDelete = false;
    if (userContext.role?.toUpperCase() === 'SUPERADMIN') {
      const resp = window.prompt(
        'Você é SuperAdmin. Digite "FISICA" para deletar definitivamente do banco de dados (Hard Delete), ou clique em OK para Ocultar Visualmente (Soft Delete):',
        'VISUAL'
      );
      if (resp === null) return;
      if (resp.trim().toUpperCase() === 'FISICA') {
        hardDelete = true;
      }
    } else {
      if (!window.confirm('Tem certeza que deseja ocultar este aviso do mural? O registro será arquivado com deleção visual.')) return;
    }

    try {
      const res = await axios.delete(`${API_URL}/regional/${id}/avisos/${avisoId}?hard_delete=${hardDelete}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert(res.data?.message || 'Aviso processado com sucesso.');
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover aviso');
    }
  };

  // Membros da mesa
  const presidente = diretoria.find(d => d.cargo.toLowerCase() === 'presidente');
  const vicePresidente = diretoria.find(d => d.cargo.toLowerCase() === 'vice-presidente' || d.cargo.toLowerCase() === 'vice_presidente');
  const secretario = diretoria.find(d => d.cargo.toLowerCase() === 'secretario');

  // Métricas de Lojas
  const totalLojas = conselho?.lojas?.length || 0;
  const lojasComVm = conselho?.lojas?.filter((l: any) => !!l.hasVm).length || 0;
  const lojasPendentes = totalLojas - lojasComVm;

  if (loading) {
    return (
      <div className="h-screen bg-[#080808] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#facc15] animate-spin" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="h-screen bg-[#080808] flex items-center justify-center flex-col gap-4 text-orange-500 font-bold">
        <ShieldCheck className="w-16 h-16"/> {erro}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200">
      
      {/* Barra Contextual de Governança & Simulação de Acesso */}
      <div className="bg-[#111] border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15] border border-[#facc15]/20">
              <ShieldCheck className="w-5 h-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#facc15] uppercase tracking-wider">Módulo 01</span>
                <span className="text-gray-600">•</span>
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  {conselho?.nome || 'Conselho Regional'}
                </h1>
              </div>
              <p className="text-xs text-green-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Perfil Ativo: <span className="font-bold text-white">{userContext.role}</span>
                {userContext.loja_id && ` (Representante Loja Ref: ${userContext.loja_id})`}
              </p>
            </div>
          </div>

          {/* Teste Rápido de RBAC (Dev Tool) */}
          <div className="flex items-center gap-2 bg-[#181818] border border-[#333] px-3 py-1.5 rounded-xl text-xs">
            <span className="text-gray-400 font-medium">Simular Acesso:</span>
            <select 
              value={activeUserId} 
              onChange={(e) => setActiveUserId(e.target.value)}
              className="bg-[#0a0a0a] text-[#facc15] border border-[#444] rounded-lg px-2.5 py-1 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="CIM_12345_PRESIDENTE">Presidente (Diretoria)</option>
              <option value="272875">Secretário (André - CIM 272875)</option>
              <option value="superadmin">SuperAdmin</option>
              <option value="VM_1">VM - Loja 1</option>
              <option value="VM_135">VM - Loja 135</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Atiradores Executivos para Módulos 08 (Mesa Diretora) e 07 (Lojas Jurisdicionadas) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card Resumo: Gestão da Mesa Diretora (Página 8) */}
          <div className="bg-gradient-to-br from-[#161616] to-[#101010] border border-[#2d2d2d] hover:border-[#facc15]/40 rounded-2xl p-6 shadow-xl transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/20">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#facc15] uppercase tracking-wider block">Módulo 08</span>
                    <h3 className="text-base font-bold text-white">Mesa Diretora do Conselho</h3>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full font-semibold text-[10px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Mandato Ativo
                </span>
              </div>

              <div className="bg-[#0c0c0c] border border-[#222] rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Presidente Eleito:</span>
                  <span className="text-white font-bold truncate max-w-[200px]">
                    {presidente?.nome_completo || 'Aguardando Nomeação'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Vigência Gestão:</span>
                  <span className="text-[#facc15] font-semibold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {presidente?.inicio_mandato?.split('-')[0] || '2026'} - {presidente?.termino_mandato?.split('-')[0] || '2027'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-500 pt-1 border-t border-[#1a1a1a]">
                  <span>Vice: {vicePresidente?.nome_completo ? vicePresidente.nome_completo.split(' ').slice(0, 2).join(' ') : 'Definir'}</span>
                  <span>Sec: {secretario?.nome_completo ? secretario.nome_completo.split(' ').slice(0, 2).join(' ') : 'Definir'}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#222] flex items-center justify-between">
              <span className="text-xs text-gray-400">Gestão de mandatos e titulares</span>
              <Link 
                to={`/regiao/${id}/diretoria`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 hover:bg-[#facc15]/20 border border-[#facc15]/30 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                Acessar Mesa Diretora <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card Resumo: Gestão das Lojas Jurisdicionadas (Página 7) */}
          <div className="bg-gradient-to-br from-[#161616] to-[#101010] border border-[#2d2d2d] hover:border-blue-500/40 rounded-2xl p-6 shadow-xl transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Módulo 07</span>
                    <h3 className="text-base font-bold text-white">Lojas Jurisdicionadas</h3>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-[#202020] text-gray-300 border border-[#333] rounded-full font-bold text-[10px]">
                  {totalLojas} Lojas Integradas
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#0c0c0c] border border-[#222] rounded-xl p-3">
                  <span className="text-gray-400 block mb-1">Com Venerável</span>
                  <div className="text-xl font-extrabold text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {lojasComVm}
                  </div>
                  <span className="text-[10px] text-green-500/70">Lideranças ativas</span>
                </div>

                <div className="bg-[#0c0c0c] border border-[#222] rounded-xl p-3">
                  <span className="text-gray-400 block mb-1">Pendentes de Posse</span>
                  <div className="text-xl font-extrabold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {lojasPendentes}
                  </div>
                  <span className="text-[10px] text-amber-500/70">Aguardando registro</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#222] flex items-center justify-between">
              <span className="text-xs text-gray-400">Relação completa, ritos e VMs</span>
              <Link 
                to={`/regiao/${id}/lojas`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                Gerenciar Lojas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>

        {/* Seção Principal: Mural de Avisos & Documentos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Widget Principal: Avisos e Notificações (Ocupa 2 colunas no desktop) */}
          <div className="lg:col-span-2 bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#242424] mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#facc15]/10 border border-[#facc15]/20 rounded-xl text-[#facc15]">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-wide">
                        Mural de Avisos e Notificações
                      </h3>
                      <span className="bg-[#222] text-[#facc15] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#444]">
                        {avisos.length} {avisos.length === 1 ? 'comunicado' : 'comunicados'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Comunicados oficiais, convocações solenes e novidades das Lojas e Diretoria
                    </p>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => setShowNovoAvisoModal(true)}
                  className="flex items-center gap-1.5 text-xs font-bold bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" /> Novo Comunicado
                </button>
              </div>

              {/* Lista de Avisos */}
              <div className="space-y-3.5 max-h-[580px] overflow-y-auto pr-1">
                {avisos.length === 0 ? (
                  <div className="text-center py-16 text-gray-500 text-xs">
                    Nenhum comunicado oficial registrado no momento.
                  </div>
                ) : (
                  avisos.map((a: any) => {
                    const isUrgente = a.nivel === 'ALTO';
                    const isAlerta = a.nivel === 'MEDIO';
                    const isNotificacao = a.tipo === 'NOTIFICACAO';

                    return (
                      <div 
                        key={a.id}
                        className={`p-4 rounded-xl border transition-all ${
                          a.deletado_visualmente
                            ? 'bg-[#141414] border-red-500/30 opacity-60'
                            : a.fixado 
                              ? 'bg-gradient-to-r from-[#1c1a12] to-[#151515] border-[#facc15]/30 shadow-md' 
                              : isUrgente
                                ? 'bg-gradient-to-r from-[#201010] to-[#161616] border-red-500/40 shadow-md'
                                : 'bg-[#181818] border-[#2b2b2b] hover:border-[#444]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {a.fixado && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/30">
                                  <Pin className="w-3 h-3" /> FIXADO
                                </span>
                              )}
                              
                              {/* Tag de Nível de Atenção */}
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isUrgente
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                                  : isAlerta
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  isUrgente ? 'bg-red-400' : isAlerta ? 'bg-amber-400' : 'bg-blue-400'
                                }`}></span>
                                {isUrgente ? 'Urgência' : isAlerta ? 'Alerta' : 'Informativo'}
                              </span>

                              {/* Tag Tipo */}
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#222] text-gray-300 border border-[#333]">
                                {isNotificacao ? 'Novidade / Informe' : 'Comunicado'}
                              </span>

                              {/* Tag Deleção Visual (SuperAdmin) */}
                              {a.deletado_visualmente && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                                  OCULTADO VISUALMENTE
                                </span>
                              )}

                              <h4 className="text-sm font-bold text-white ml-0.5">{a.titulo}</h4>
                            </div>

                            <p className="text-xs text-gray-300 leading-relaxed pt-0.5 whitespace-pre-line">
                              {a.conteudo}
                            </p>
                          </div>

                          {/* Botão Excluir / Ocultar */}
                          {a.pode_excluir && (
                            <button
                              type="button"
                              onClick={() => handleExcluirAviso(a.id)}
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                              title={userContext.role?.toUpperCase() === 'SUPERADMIN' ? "Opção de Deleção Visual ou Hard Delete Definitivo" : "Ocultar comunicado (Deleção Visual)"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-[#262626] flex items-center justify-between text-[11px] text-gray-400 flex-wrap gap-2">
                          <span className="flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-[#facc15]" />
                            <span className="text-gray-300 font-medium">{a.autor_nome || 'Conselho'}</span>
                            {a.loja_id && <span className="text-[#facc15]/80 font-medium">(Loja Ref: {a.loja_id})</span>}
                          </span>

                          <div className="flex items-center gap-3 text-gray-400">
                            {a.data_validade && (
                              <span className="text-amber-400/90 font-medium">
                                Válido até: {a.data_validade.split('-').reverse().join('/')}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-gray-500">
                              <Calendar className="w-3 h-3 text-gray-500" />
                              {a.data_publicacao ? a.data_publicacao.split('-').reverse().join('/') : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Widget Lateral: Atas e Repositório */}
          <div className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-[#242424] mb-4">
                <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Atas e Documentos</h3>
                  <p className="text-xs text-gray-400">Repositório documental regional</p>
                </div>
              </div>
              <div className="py-8 text-center space-y-2">
                <div className="text-4xl font-black text-white">0</div>
                <p className="text-xs text-gray-400">Atas e relatórios arquivados</p>
              </div>
            </div>
            <div className="pt-4 border-t border-[#242424]">
              <Link 
                to={`/regiao/${id}/documentos`}
                className="w-full bg-[#1c1c1c] hover:bg-[#252525] text-purple-400 border border-purple-500/30 font-semibold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> Consultar Repositório Oficial
              </Link>
            </div>
          </div>

        </div>

      </div>

      {/* Modal: Publicar Novo Aviso no Mural */}
      {showNovoAvisoModal && (() => {
        const numPalavras = avisoForm.conteudo.trim().split(/\s+/).filter(Boolean).length;
        const excedeuLimite = numPalavras > 200;

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
            <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/30">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Publicar no Mural do Conselho</h2>
                  <p className="text-xs text-gray-400">Aviso ou notificação visível para as Lojas e Diretoria.</p>
                </div>
              </div>

              <form onSubmit={handleCriarAviso} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Título *
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Convocação para Sessão Conjunta / Alerta de Prazo"
                    value={avisoForm.titulo}
                    onChange={(e) => setAvisoForm({...avisoForm, titulo: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Nível de Atenção *
                    </label>
                    <select 
                      value={avisoForm.nivel}
                      onChange={(e) => setAvisoForm({...avisoForm, nivel: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-xs text-[#facc15] font-semibold focus:border-[#facc15] focus:outline-none"
                    >
                      <option value="BAIXO">🟢 Baixo - Aviso Informativo</option>
                      <option value="MEDIO">🟡 Médio - Avisos de Alerta</option>
                      <option value="ALTO">🔴 Alto - Avisos de Urgência</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Tipo de Postagem
                    </label>
                    <select 
                      value={avisoForm.tipo}
                      onChange={(e) => setAvisoForm({...avisoForm, tipo: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-xs text-white focus:border-[#facc15] focus:outline-none"
                    >
                      <option value="AVISO">Comunicado Geral</option>
                      <option value="NOTIFICACAO">Notificação / Informe</option>
                      <option value="CONVOCACAO">Convocação Solene</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Conteúdo da Mensagem *
                    </label>
                    <span className={`text-[11px] font-bold ${excedeuLimite ? 'text-red-400' : 'text-gray-500'}`}>
                      {numPalavras} / 200 palavras
                    </span>
                  </div>
                  <textarea 
                    rows={4}
                    required
                    value={avisoForm.conteudo}
                    onChange={(e) => setAvisoForm({...avisoForm, conteudo: e.target.value})}
                    placeholder="Escreva os detalhes do aviso ou notificação (máximo de 200 palavras)..."
                    className={`w-full bg-[#080808] border rounded-xl p-2.5 text-xs text-white focus:outline-none ${
                      excedeuLimite ? 'border-red-500 focus:border-red-500' : 'border-[#333] focus:border-[#facc15]'
                    }`}
                  />
                  {excedeuLimite && (
                    <p className="text-[11px] text-red-400 mt-1">
                      Limite ultrapassado! O comunicado não pode ter mais de 200 palavras.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Data de Validade (Opcional)
                    </label>
                    <input 
                      type="date"
                      value={avisoForm.data_validade}
                      onChange={(e) => setAvisoForm({...avisoForm, data_validade: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                    />
                  </div>

                  {userContext.is_diretoria && (
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none">
                        <input 
                          type="checkbox"
                          checked={avisoForm.fixado}
                          onChange={(e) => setAvisoForm({...avisoForm, fixado: e.target.checked})}
                          className="rounded border-[#444] text-[#facc15] focus:ring-[#facc15] h-4 w-4 bg-[#222]"
                        />
                        <span>Fixar no topo do mural</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                  <button 
                    type="button" 
                    onClick={() => setShowNovoAvisoModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={salvandoAviso || excedeuLimite}
                    className="bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {salvandoAviso ? 'Publicando...' : 'Publicar Comunicado'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
