// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { 
  ShieldCheck, Loader2, Award, Calendar, 
  Bell, Pin, Trash2, Plus 
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const [conselho, setConselho] = useState<any>(null);
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

  // Carregar dados da região e avisos
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const headers = { 'X-User-Id': activeUserId };

      // 1. Contexto do usuário logado (RBAC)
      const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
      setUserContext(userRes.data);

      // 2. Dados da Região e Avisos
      const [resDashboard, resAvisos] = await Promise.all([
        axios.get(`${API_URL}/regional/${id}/dashboard`, { headers }),
        axios.get(`${API_URL}/regional/${id}/avisos`, { headers })
      ]);

      setConselho(resDashboard.data);
      setAvisos(resAvisos.data || []);
    } catch (err: any) {
      setErro(err.response?.data?.detail || "Acesso negado ao painel regional.");
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
              <Bell className="w-5 h-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#facc15] uppercase tracking-wider">Módulo 01</span>
                <span className="text-gray-600">•</span>
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  Notificações e Avisos
                </h1>
              </div>
              <p className="text-xs text-green-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Perfil Ativo: <span className="font-bold text-white">{userContext.role}</span>
                {userContext.loja_id && ` (Representante Loja Ref: ${userContext.loja_id})`}
                <span className="text-gray-500 ml-1.5">| {conselho?.nome || 'Conselho Regional'}</span>
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
        
        {/* Card Principal: Mural de Avisos e Notificações (Ocupa Toda a Página) */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-2xl">
          
          <div className="flex flex-wrap items-center justify-between pb-5 border-b border-[#242424] mb-6 gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-[#facc15]/10 border border-[#facc15]/20 rounded-2xl text-[#facc15]">
                <Bell className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-bold text-white tracking-wide">
                    Mural de Avisos e Notificações
                  </h2>
                  <span className="bg-[#222] text-[#facc15] text-xs font-bold px-3 py-0.5 rounded-full border border-[#444]">
                    {avisos.length} {avisos.length === 1 ? 'publicação' : 'publicações'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Comunicados oficiais, convocações solenes, informes e novidades das Lojas Jurisdicionadas e Diretoria do Conselho
                </p>
              </div>
            </div>

            <button 
              type="button"
              onClick={() => setShowNovoAvisoModal(true)}
              className="inline-flex items-center gap-2 text-xs font-bold bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Publicar Novo Comunicado
            </button>
          </div>

          {/* Lista de Avisos e Notificações */}
          <div className="space-y-4 min-h-[400px]">
            {avisos.length === 0 ? (
              <div className="text-center py-24 text-gray-500 space-y-3">
                <Bell className="w-12 h-12 mx-auto text-gray-700 stroke-1" />
                <p className="text-sm font-medium">Nenhum aviso ou comunicado publicado no momento.</p>
                <p className="text-xs text-gray-600">Utilize o botão acima para publicar o primeiro comunicado do Conselho.</p>
              </div>
            ) : (
              avisos.map((a: any) => {
                const isUrgente = a.nivel === 'ALTO';
                const isAlerta = a.nivel === 'MEDIO';
                const isNotificacao = a.tipo === 'NOTIFICACAO';

                return (
                  <div 
                    key={a.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      a.deletado_visualmente
                        ? 'bg-[#141414] border-red-500/30 opacity-60'
                        : a.fixado 
                          ? 'bg-gradient-to-r from-[#1c1a12] via-[#161510] to-[#121212] border-[#facc15]/40 shadow-lg' 
                          : isUrgente
                            ? 'bg-gradient-to-r from-[#201010] to-[#141414] border-red-500/40 shadow-md'
                            : 'bg-[#181818] border-[#292929] hover:border-[#3d3d3d]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {a.fixado && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/30">
                              <Pin className="w-3 h-3" /> FIXADO
                            </span>
                          )}
                          
                          {/* Tag de Nível de Atenção */}
                          <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#222] text-gray-300 border border-[#333]">
                            {isNotificacao ? 'Novidade / Informe' : 'Comunicado'}
                          </span>

                          {/* Tag Deleção Visual (SuperAdmin) */}
                          {a.deletado_visualmente && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                              OCULTADO VISUALMENTE
                            </span>
                          )}

                          <h3 className="text-base font-bold text-white ml-1">{a.titulo}</h3>
                        </div>

                        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed pt-1 whitespace-pre-line">
                          {a.conteudo}
                        </p>
                      </div>

                      {/* Botão Excluir / Ocultar */}
                      {a.pode_excluir && (
                        <button
                          type="button"
                          onClick={() => handleExcluirAviso(a.id)}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors shrink-0 cursor-pointer"
                          title={userContext.role?.toUpperCase() === 'SUPERADMIN' ? "Opção de Deleção Visual ou Hard Delete Definitivo" : "Ocultar comunicado (Deleção Visual)"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-xs text-gray-400 flex-wrap gap-2">
                      <span className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-[#facc15]" />
                        <span className="text-gray-300 font-semibold">{a.autor_nome || 'Conselho Regional'}</span>
                        {a.loja_id && <span className="text-[#facc15]/90 font-medium">(Loja Ref: {a.loja_id})</span>}
                      </span>

                      <div className="flex items-center gap-4 text-gray-400 text-xs">
                        {a.data_validade && (
                          <span className="text-amber-400 font-semibold bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                            Válido até: {a.data_validade.split('-').reverse().join('/')}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                          Publicado em {a.data_publicacao ? a.data_publicacao.split('-').reverse().join('/') : ''}
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
