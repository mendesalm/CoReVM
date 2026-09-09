// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { 
  ShieldCheck, Loader2, Award, Calendar, 
  Bell, Pin, Trash2, Plus, AlertTriangle, AlertOctagon, 
  Sparkles, Megaphone
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  
  // Controle de Usuário e RBAC
  const [activeUserId] = useState('CIM_12345_PRESIDENTE');
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

  // Carregar dados e avisos
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const headers = { 'X-User-Id': activeUserId };

      // 1. Contexto do usuário logado (RBAC)
      const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
      setUserContext(userRes.data);

      // 2. Avisos da Região
      const resAvisos = await axios.get(`${API_URL}/regional/${id}/avisos`, { headers });
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

  // Abertura com tipo pré-selecionado
  const abrirModalNovo = (tipo: 'AVISO' | 'NOTIFICACAO') => {
    setAvisoForm({
      titulo: '',
      conteudo: '',
      tipo,
      nivel: 'BAIXO',
      data_validade: '',
      fixado: false
    });
    setShowNovoAvisoModal(true);
  };

  // Publicar Novo Aviso ou Notificação
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
      alert(`${avisoForm.tipo === 'NOTIFICACAO' ? 'Notificação' : 'Aviso'} publicado com sucesso no mural do conselho!`);
      setShowNovoAvisoModal(false);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao publicar aviso');
    } finally {
      setSalvandoAviso(false);
    }
  };

  // Excluir Aviso / Notificação
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
      if (!window.confirm('Tem certeza que deseja ocultar este item do mural? O registro será arquivado com deleção visual.')) return;
    }

    try {
      const res = await axios.delete(`${API_URL}/regional/${id}/avisos/${avisoId}?hard_delete=${hardDelete}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert(res.data?.message || 'Item processado com sucesso.');
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover item');
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

  // Separação em duas colunas: Avisos (Esquerda) e Notificações (Direita)
  const itensAvisos = avisos.filter((a: any) => a.tipo !== 'NOTIFICACAO');
  const itensNotificacoes = avisos.filter((a: any) => a.tipo === 'NOTIFICACAO');

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200 p-6 sm:p-8">
      
      {/* Container Principal: Grid de 2 Colunas (Avisos à esquerda, Notificações à direita) */}
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* ======================================================== */}
          {/* COLUNA 1: AVISOS (COM BORDAS CONFORME O NÍVEL: VERDE, AMARELO, VERMELHO) */}
          {/* ======================================================== */}
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col space-y-4">
            
            {/* Cabeçalho da Coluna de Avisos */}
            <div className="flex items-center justify-between pb-4 border-b border-[#222] gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                      Mural de Avisos
                    </h2>
                    <span className="bg-[#1e1e1e] text-[#facc15] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#333]">
                      {itensAvisos.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Comunicados e convocações solenes do Conselho
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => abrirModalNovo('AVISO')}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#facc15] hover:bg-[#eab308] text-black px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Novo Aviso
              </button>
            </div>

            {/* Lista de Cards de Avisos */}
            <div className="space-y-4 max-h-[calc(100vh-210px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#222]">
              {itensAvisos.length === 0 ? (
                <div className="text-center py-20 text-gray-500 space-y-2">
                  <Megaphone className="w-10 h-10 mx-auto text-gray-700 stroke-1" />
                  <p className="text-xs font-medium">Nenhum comunicado ou aviso cadastrado no momento.</p>
                </div>
              ) : (
                itensAvisos.map((a: any) => {
                  const isUrgente = a.nivel === 'ALTO';
                  const isAlerta = a.nivel === 'MEDIO';
                  // Regra do Usuário: Bordas de acordo com seu nível (verde, amarelo e vermelho)
                  const borderClass = isUrgente 
                    ? 'border-2 border-red-500 shadow-lg shadow-red-950/30' 
                    : isAlerta 
                      ? 'border-2 border-yellow-400 shadow-md shadow-amber-950/20' 
                      : 'border-2 border-green-500 shadow-md shadow-emerald-950/20';

                  return (
                    <div
                      key={a.id}
                      className={`p-4 sm:p-5 rounded-2xl transition-all ${borderClass} ${
                        a.deletado_visualmente
                          ? 'bg-[#111] opacity-60'
                          : a.fixado
                            ? 'bg-gradient-to-r from-[#1c1a12] via-[#161510] to-[#121212]'
                            : isUrgente
                              ? 'bg-gradient-to-r from-[#1e1010] to-[#141414]'
                              : 'bg-[#161616]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {a.fixado && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/30">
                                <Pin className="w-3 h-3" /> FIXADO
                              </span>
                            )}

                            {/* Badge do Nível */}
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isUrgente
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                                : isAlerta
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-green-500/20 text-green-400 border border-green-500/40'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isUrgente ? 'bg-red-400' : isAlerta ? 'bg-amber-400' : 'bg-green-400'
                              }`}></span>
                              {isUrgente ? 'Urgência' : isAlerta ? 'Alerta' : 'Informativo'}
                            </span>

                            {a.deletado_visualmente && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                                OCULTADO
                              </span>
                            )}

                            <h3 className="text-sm sm:text-base font-bold text-white ml-0.5">{a.titulo}</h3>
                          </div>

                          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line pt-0.5">
                            {a.conteudo}
                          </p>
                        </div>

                        {/* Botão Excluir */}
                        {a.pode_excluir && (
                          <button
                            type="button"
                            onClick={() => handleExcluirAviso(a.id)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors shrink-0 cursor-pointer"
                            title={userContext.role?.toUpperCase() === 'SUPERADMIN' ? "Opção de Deleção Visual ou Hard Delete" : "Ocultar aviso"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-3.5 pt-2.5 border-t border-[#262626] flex items-center justify-between text-[11px] text-gray-400 flex-wrap gap-2">
                        <span className="flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-[#facc15]" />
                          <span className="text-gray-300 font-medium">{a.autor_nome || 'Conselho'}</span>
                          {a.loja_id && <span className="text-[#facc15]/90 font-medium">(Loja {a.loja_id})</span>}
                        </span>

                        <div className="flex items-center gap-3 text-gray-400">
                          {a.data_validade && (
                            <span className="text-amber-400 font-semibold">
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

          {/* ======================================================== */}
          {/* COLUNA 2: NOTIFICAÇÕES (ESTILO DIFERENCIADO + ÍCONES COMPATÍVEIS COM O NÍVEL) */}
          {/* ======================================================== */}
          <div className="bg-[#121212] border border-[#222] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col space-y-4">
            
            {/* Cabeçalho da Coluna de Notificações */}
            <div className="flex items-center justify-between pb-4 border-b border-[#222] gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                      Notificações & Informes
                    </h2>
                    <span className="bg-[#1e1e1e] text-blue-400 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#333]">
                      {itensNotificacoes.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Alertas dinâmicos, novidades e informes das Lojas
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => abrirModalNovo('NOTIFICACAO')}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-500 hover:bg-blue-400 text-black px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Nova Notificação
              </button>
            </div>

            {/* Lista de Cards de Notificações com Estilo Feed e Ícones Compatíveis */}
            <div className="space-y-3.5 max-h-[calc(100vh-210px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#222]">
              {itensNotificacoes.length === 0 ? (
                <div className="text-center py-20 text-gray-500 space-y-2">
                  <Bell className="w-10 h-10 mx-auto text-gray-700 stroke-1" />
                  <p className="text-xs font-medium">Nenhuma notificação registrada no momento.</p>
                </div>
              ) : (
                itensNotificacoes.map((n: any) => {
                  const isUrgente = n.nivel === 'ALTO';
                  const isAlerta = n.nivel === 'MEDIO';

                  // Ícones compatíveis com seu nível
                  const IconeNivel = isUrgente 
                    ? AlertOctagon 
                    : isAlerta 
                      ? AlertTriangle 
                      : Sparkles;

                  const badgeColor = isUrgente
                    ? 'text-red-400 bg-red-500/10 border-red-500/30'
                    : isAlerta
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

                  const iconBg = isUrgente
                    ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                    : isAlerta
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';

                  return (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border border-[#242730] hover:border-[#353a47] transition-all flex gap-3.5 items-start ${
                        n.deletado_visualmente
                          ? 'bg-[#101114] opacity-60'
                          : isUrgente
                            ? 'bg-gradient-to-r from-[#1c1214] to-[#121317]'
                            : 'bg-[#13151b]'
                      }`}
                    >
                      {/* Ícone de Destaque Compatível com o Nível */}
                      <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${iconBg}`}>
                        <IconeNivel className="w-5 h-5" />
                      </div>

                      {/* Conteúdo da Notificação */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                              {isUrgente ? 'Urgência' : isAlerta ? 'Alerta' : 'Informe'}
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[220px] sm:max-w-[280px]">
                              {n.titulo}
                            </h4>
                          </div>

                          {n.pode_excluir && (
                            <button
                              type="button"
                              onClick={() => handleExcluirAviso(n.id)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                              title="Ocultar notificação"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-gray-300 leading-relaxed mt-1.5 whitespace-pre-line">
                          {n.conteudo}
                        </p>

                        <div className="mt-2.5 pt-2 border-t border-[#1c1e26] flex items-center justify-between text-[10px] text-gray-500 flex-wrap gap-2">
                          <span>
                            Por: <strong className="text-gray-300">{n.autor_nome || 'Conselho'}</strong>
                            {n.loja_id && <span className="text-[#facc15]/80 ml-1">(Loja {n.loja_id})</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {n.data_publicacao ? n.data_publicacao.split('-').reverse().join('/') : ''}
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

      </div>

      {/* Modal: Publicar Novo Comunicado (Aviso ou Notificação) */}
      {showNovoAvisoModal && (() => {
        const numPalavras = avisoForm.conteudo.trim().split(/\s+/).filter(Boolean).length;
        const excedeuLimite = numPalavras > 200;

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
            <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2.5 rounded-xl border ${
                  avisoForm.tipo === 'NOTIFICACAO' 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                    : 'bg-[#facc15]/10 text-[#facc15] border-[#facc15]/30'
                }`}>
                  {avisoForm.tipo === 'NOTIFICACAO' ? <Bell className="w-6 h-6" /> : <Megaphone className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Publicar {avisoForm.tipo === 'NOTIFICACAO' ? 'Notificação' : 'Aviso'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    Visível para todas as Lojas Jurisdicionadas e Diretoria do Conselho.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCriarAviso} className="space-y-4">
                
                {/* Seletor de Tipo */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAvisoForm({...avisoForm, tipo: 'AVISO'})}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      avisoForm.tipo === 'AVISO'
                        ? 'bg-[#facc15] text-black border-[#facc15]'
                        : 'bg-[#181818] text-gray-400 border-[#333] hover:text-white'
                    }`}
                  >
                    <Megaphone className="w-4 h-4" /> Coluna de Avisos
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvisoForm({...avisoForm, tipo: 'NOTIFICACAO'})}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      avisoForm.tipo === 'NOTIFICACAO'
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-[#181818] text-gray-400 border-[#333] hover:text-white'
                    }`}
                  >
                    <Bell className="w-4 h-4" /> Coluna de Notificações
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Título da Publicação *
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Convocação para Sessão Conjunta / Alerta de Prazo..."
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
                      <option value="BAIXO">🟢 Baixo - Informativo (Borda Verde)</option>
                      <option value="MEDIO">🟡 Médio - Alerta (Borda Amarela)</option>
                      <option value="ALTO">🔴 Alto - Urgência (Borda Vermelha)</option>
                    </select>
                  </div>

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
                    placeholder="Escreva os detalhes da mensagem (máximo de 200 palavras)..."
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

                {userContext.is_diretoria && (
                  <div className="flex items-center pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none">
                      <input 
                        type="checkbox"
                        checked={avisoForm.fixado}
                        onChange={(e) => setAvisoForm({...avisoForm, fixado: e.target.checked})}
                        className="rounded border-[#444] text-[#facc15] focus:ring-[#facc15] h-4 w-4 bg-[#222]"
                      />
                      <span>Fixar no topo da coluna</span>
                    </label>
                  </div>
                )}

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
                    {salvandoAviso ? 'Publicando...' : 'Publicar'}
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
