// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { clienteHttp } from '../../../compartilhado/contextos/AuthContext';
import { useParams, Link } from 'react-router-dom';
import {
  Building2, ShieldCheck, Loader2, Award,
  Edit3, Trash2, Plus, Search, CheckCircle2, AlertTriangle, ArrowLeft,
  Users, UserCog, X
} from 'lucide-react';
import BuscadorLoja from '../../../compartilhado/componentes/BuscadorLoja';
import ModalCadastroObreiro from '../../../compartilhado/componentes/ModalCadastroObreiro';
import ModalGestaoVM from '../../../compartilhado/componentes/ModalGestaoVM';

const API_URL = 'http://localhost:8003/api/v1';

// ALTERAÇÃO (2026-09-11, correção de bug): o `detail` de um erro 422 do
// FastAPI (falha de validação, ex.: header Authorization ausente) vem como
// uma LISTA de objetos ({type, loc, msg, input}), não uma string — renderizar
// esse valor direto como filho de um elemento React quebra a página
// ("Objects are not valid as a React child"). Esta função normaliza qualquer
// formato de erro do backend (string simples, lista de erros de validação,
// ou erro de rede) para uma string segura de exibir.
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

// ALTERAÇÃO (2026-09-11, auditoria pós-fix de segurança): esta página usava
// axios puro + um seletor "Simular Acesso" que enviava um header X-User-Id
// não autenticado — mecanismo de teste anterior ao fix de segurança do
// e-Sigma. As rotas /regional/{id}/me, /dashboard, POST e DELETE lojas agora
// exigem Authorization: Bearer real (via get_current_regional_user), então
// o simulador nunca mais funcionaria. Substituído por clienteHttp (injeta o
// token real do login via AuthContext) e o contexto de usuário passou a vir
// inteiramente da resposta de /regional/{id}/me.

export default function PaginaLojas() {
  const { id } = useParams();
  const [conselho, setConselho] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Contexto de Usuário e RBAC — vem de /regional/{id}/me (Authorization real)
  const [userContext, setUserContext] = useState<any>({
    usuario_id: null,
    role: null,
    is_diretoria: false,
    loja_id: null
  });

  // Filtro e Busca
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'TODAS' | 'COM_VM' | 'PENDENTES'>('TODAS');

  // Modais
  const [gestaoVmModal, setGestaoVmModal] = useState<any>(null);
  const [addObreiroModal, setAddObreiroModal] = useState<any>(null);
  const [addSuplenteModal, setAddSuplenteModal] = useState<any>(null);
  const [showAddLojaModal, setShowAddLojaModal] = useState(false);
  const [editLojaModal, setEditLojaModal] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ALTERAÇÃO (2026-09-12): "Designação Livre de Suplente" — o VM da própria
  // Loja (ou a Diretoria do Conselho, para qualquer Loja) escolhe livremente
  // qualquer um dos 7 oficiais eletivos da Loja para ocupar a cadeira de
  // Suplente do Conselho. Usa as novas rotas GET /lojas/{id}/oficiais e
  // PUT|DELETE /lojas/{id}/suplente (backend, seção 9.13 do histórico).
  const [designarSuplenteModal, setDesignarSuplenteModal] = useState<any>(null);
  const [oficiaisLoja, setOficiaisLoja] = useState<any[]>([]);
  const [carregandoOficiais, setCarregandoOficiais] = useState(false);
  const [suplenteEscolhido, setSuplenteEscolhido] = useState('');
  const [salvandoSuplente, setSalvandoSuplente] = useState(false);

  // Form Edição de Loja
  const [editLojaForm, setEditLojaForm] = useState({
    nome: '',
    numero: '',
    rito: '',
    cidade: ''
  });
  const [salvandoLoja, setSalvandoLoja] = useState(false);

  const abrirEdicaoLoja = (loja: any) => {
    setEditLojaModal(loja);
    setEditLojaForm({
      nome: loja.nome ? loja.nome.replace(/^Loja\s+/i, '') : '',
      numero: loja.numero || '',
      rito: loja.rito || 'REAA',
      cidade: loja.cidade || ''
    });
  };

  const handleSalvarLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLojaModal) return;
    setSalvandoLoja(true);
    try {
      await axios.put(`${API_URL}/integracao/lojas/${editLojaModal.loja_id}`, editLojaForm);
      alert('Cadastro da loja atualizado com sucesso!');
      setEditLojaModal(null);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao atualizar dados da loja'));
    } finally {
      setSalvandoLoja(false);
    }
  };

  // Carregar dados completos
  const fetchData = async () => {
    setLoading(true);
    try {
      const [userRes, resDashboard] = await Promise.all([
        clienteHttp.get(`${API_URL}/regional/${id}/me`),
        clienteHttp.get(`${API_URL}/regional/${id}/dashboard`)
      ]);

      setUserContext(userRes.data);
      const data = resDashboard.data;

      if (data.lojas && data.lojas.length > 0) {
        const ids = data.lojas.map((l: any) => parseInt(l.loja_id)).filter((n: number) => !isNaN(n));
        if (ids.length > 0) {
          const [detailsRes, vmStatusRes] = await Promise.all([
            axios.post(`${API_URL}/integracao/lojas/busca/multiplas`, ids),
            axios.post(`${API_URL}/integracao/lojas/status_vm`, ids)
          ]);
          data.lojas = data.lojas.map((l: any) => {
            const det = detailsRes.data.find((d: any) => String(d.id) === String(l.loja_id));
            const hasVm = vmStatusRes.data[l.loja_id];
            return { 
              ...l, 
              nome: det?.nome, 
              numero: det?.numero, 
              cidade: det?.cidade, 
              potencia: det?.potencia, 
              rito: det?.rito, 
              hasVm 
            };
          });
          // Ordena por Potência e depois por Número da Loja
          data.lojas.sort((a: any, b: any) => {
            const potA = a.potencia || '';
            const potB = b.potencia || '';
            if (potA !== potB) return potA.localeCompare(potB);
            return (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0);
          });
        }
      }
      setConselho(data);
    } catch (err: any) {
      setErro(extrairMensagemErro(err, "Erro ao carregar dados das lojas."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id, reloadKey]);

  const vincularLoja = async (lojaId: number) => {
    try {
      await clienteHttp.post(`${API_URL}/regional/${id}/lojas`, { loja_id: lojaId.toString() });
      alert('Loja vinculada ao conselho com sucesso!');
      setShowAddLojaModal(false);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao vincular loja'));
    }
  };

  const removerLoja = async (lojaId: string) => {
    if (!confirm('Deseja realmente remover esta loja do conselho?')) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/lojas/${lojaId}`);
      alert('Loja removida com sucesso!');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao remover loja'));
    }
  };

  const abrirDesignarSuplente = async (loja: any) => {
    setDesignarSuplenteModal(loja);
    setSuplenteEscolhido(loja.suplente_usuario_id || '');
    setOficiaisLoja([]);
    setCarregandoOficiais(true);
    try {
      const res = await clienteHttp.get(`${API_URL}/regional/${id}/lojas/${loja.loja_id}/oficiais`);
      setOficiaisLoja(res.data?.oficiais || []);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao carregar os oficiais da loja'));
      setDesignarSuplenteModal(null);
    } finally {
      setCarregandoOficiais(false);
    }
  };

  const handleDesignarSuplente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designarSuplenteModal || !suplenteEscolhido) return;
    setSalvandoSuplente(true);
    try {
      await clienteHttp.put(`${API_URL}/regional/${id}/lojas/${designarSuplenteModal.loja_id}/suplente`, {
        usuario_id: suplenteEscolhido
      });
      alert('Suplente do Conselho designado com sucesso!');
      setDesignarSuplenteModal(null);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao designar suplente'));
    } finally {
      setSalvandoSuplente(false);
    }
  };

  const handleRemoverSuplente = async () => {
    if (!designarSuplenteModal) return;
    if (!confirm('Deseja realmente remover a designação de Suplente desta loja?')) return;
    setSalvandoSuplente(true);
    try {
      await clienteHttp.delete(`${API_URL}/regional/${id}/lojas/${designarSuplenteModal.loja_id}/suplente`);
      alert('Designação de Suplente removida com sucesso!');
      setDesignarSuplenteModal(null);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao remover suplente'));
    } finally {
      setSalvandoSuplente(false);
    }
  };

  const totalLojas = conselho?.lojas?.length || 0;
  const lojasComVm = conselho?.lojas?.filter((l: any) => !!l.hasVm).length || 0;
  const lojasPendentes = totalLojas - lojasComVm;

  // Filtragem
  const lojasFiltradas = (conselho?.lojas || []).filter((l: any) => {
    const matchBusca = 
      (l.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
      (l.numero || '').toString().includes(busca) ||
      (l.potencia || '').toLowerCase().includes(busca.toLowerCase()) ||
      (l.rito || '').toLowerCase().includes(busca.toLowerCase()) ||
      (l.cidade || '').toLowerCase().includes(busca.toLowerCase()) ||
      (l.veneravel_nome || '').toLowerCase().includes(busca.toLowerCase());

    if (!matchBusca) return false;

    if (filtroStatus === 'COM_VM') return !!l.hasVm;
    if (filtroStatus === 'PENDENTES') return !l.hasVm;
    return true;
  });

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
      
      {/* Sub-Header Contextual */}
      <div className="bg-[#111] border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              to={`/regiao/${id}`} 
              className="p-1.5 text-gray-400 hover:text-white hover:bg-[#222] rounded-lg transition-colors mr-1"
              title="Voltar ao Painel Geral"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15] border border-[#facc15]/20">
              <Building2 className="w-5 h-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#facc15] uppercase tracking-wider">Módulo 07</span>
                <span className="text-gray-600">•</span>
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  Gestão das Lojas Jurisdicionadas
                </h1>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {conselho?.nome || 'Conselho Regional'} — Quadro de lojas, potências, ritos e veneráveis mestres
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Painel de Métricas Rápidas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-400 block mb-1">Lojas Jurisdicionadas</span>
              <div className="text-2xl font-black text-white">{totalLojas}</div>
              <span className="text-[11px] text-gray-500">Total integradas ao conselho</span>
            </div>
            <div className="p-3 rounded-xl bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20">
              <Building2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-400 block mb-1">Com Venerável Mestre</span>
              <div className="text-2xl font-black text-green-400">{lojasComVm}</div>
              <span className="text-[11px] text-green-500/80">Liderança regular e empossada</span>
            </div>
            <div className="p-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-400 block mb-1">Mandatos Pendentes</span>
              <div className="text-2xl font-black text-amber-400">{lojasPendentes}</div>
              <span className="text-[11px] text-amber-500/80">Aguardando registro ou posse</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Card Principal: Tabela de Lojas */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl">
          
          {/* Barra de Filtros e Busca */}
          <div className="p-5 border-b border-[#262626] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar por nome da loja, número, rito, oriente ou VM..."
                  className="w-full bg-[#0d0d0d] border border-[#333] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:border-[#facc15] focus:outline-none transition-colors"
                />
              </div>

              {/* Seletor de Filtro de Status */}
              <div className="flex items-center bg-[#0d0d0d] border border-[#333] rounded-xl p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFiltroStatus('TODAS')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filtroStatus === 'TODAS' ? 'bg-[#facc15] text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                >
                  Todas ({totalLojas})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus('COM_VM')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filtroStatus === 'COM_VM' ? 'bg-green-500/20 text-green-400 font-bold border border-green-500/30' : 'text-gray-400 hover:text-white'}`}
                >
                  Com VM ({lojasComVm})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus('PENDENTES')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${filtroStatus === 'PENDENTES' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'text-gray-400 hover:text-white'}`}
                >
                  Pendentes ({lojasPendentes})
                </button>
              </div>
            </div>

            {/* Ação Primária no Topo (Adicionar Loja para Diretoria) */}
            {userContext.is_diretoria && (
              <button
                type="button"
                onClick={() => setShowAddLojaModal(true)}
                className="inline-flex items-center gap-2 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Vincular Nova Loja
              </button>
            )}
          </div>

          {/* Tabela de Lojas */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#262626] text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-[#101010]">
                  <th className="p-3.5 pl-5">Loja & Número</th>
                  <th className="p-3.5">Potência</th>
                  <th className="p-3.5">Oriente</th>
                  <th className="p-3.5">Rito Trabalhado</th>
                  <th className="p-3.5">Venerável Mestre</th>
                  <th className="p-3.5">Suplente do Conselho</th>
                  <th className="p-3.5 pr-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202020] text-xs">
                {lojasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      Nenhuma loja encontrada para o filtro informado.
                    </td>
                  </tr>
                ) : (
                  lojasFiltradas.map((l: any) => {
                    const podeEditar = userContext.is_diretoria || userContext.loja_id === l.loja_id;
                    const temVm = !!l.hasVm;

                    return (
                      <tr key={l.loja_id} className="hover:bg-[#181818] transition-colors group">
                        <td className="p-3.5 pl-5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {l.nome || `Loja #${l.loja_id}`}
                            </span>
                            {l.numero && (
                              <span className="px-2 py-0.5 rounded bg-[#202020] text-gray-300 font-mono text-[11px] border border-[#333]">
                                Nº {l.numero}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-[#202020] text-[#facc15] border border-[#333]">
                            {l.potencia || 'GOB'}
                          </span>
                        </td>

                        <td className="p-3.5 text-gray-300">
                          {l.cidade || 'Oriente Não Definido'}
                        </td>

                        <td className="p-3.5">
                          <span className="text-gray-400 font-medium">
                            {l.rito || 'REAA'}
                          </span>
                        </td>

                        <td className="p-3.5">
                          {temVm ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (podeEditar) setGestaoVmModal(l);
                              }}
                              disabled={!podeEditar}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                podeEditar 
                                  ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 cursor-pointer shadow-sm' 
                                  : 'bg-[#181818] text-gray-400 border border-[#2a2a2a] cursor-default'
                              }`}
                              title={podeEditar ? "Clique para gerenciar dados do VM e mandato" : "Venerável Mestre empossado"}
                            >
                              <Award className="w-3.5 h-3.5 text-green-400" />
                              <span>{l.veneravel_nome || 'VM Cadastrado'}</span>
                              {podeEditar && <span className="text-[10px] text-green-500/70 ml-1 font-normal">✎</span>}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (podeEditar) setGestaoVmModal(l);
                              }}
                              disabled={!podeEditar}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                podeEditar 
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 cursor-pointer' 
                                  : 'bg-[#181818] text-red-500/70 border border-[#2a2a2a] cursor-default'
                              }`}
                              title={podeEditar ? "Clique para empossar Venerável Mestre" : "Mandato Pendente"}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              <span>Pendente</span>
                              {podeEditar && <span className="text-[10px] font-bold text-red-400 ml-1">+ Definir</span>}
                            </button>
                          )}
                        </td>

                        <td className="p-3.5">
                          {l.suplente_nome ? (
                            <button
                              type="button"
                              onClick={() => { if (podeEditar) abrirDesignarSuplente(l); }}
                              disabled={!podeEditar}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                podeEditar
                                  ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 cursor-pointer shadow-sm'
                                  : 'bg-[#181818] text-gray-400 border border-[#2a2a2a] cursor-default'
                              }`}
                              title={podeEditar ? "Clique para trocar o Suplente designado" : "Suplente do Conselho"}
                            >
                              <Users className="w-3.5 h-3.5 text-blue-400" />
                              <span>{l.suplente_nome}</span>
                              {podeEditar && <span className="text-[10px] text-blue-400/70 ml-1 font-normal">✎</span>}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { if (podeEditar) abrirDesignarSuplente(l); }}
                              disabled={!podeEditar}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                podeEditar
                                  ? 'bg-[#181818] text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 border border-[#2a2a2a] hover:border-blue-500/30 cursor-pointer'
                                  : 'bg-[#181818] text-gray-600 border border-[#2a2a2a] cursor-default'
                              }`}
                              title={podeEditar ? "Clique para designar o Suplente do Conselho" : "Nenhum Suplente designado"}
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              <span>{podeEditar ? 'Designar Suplente' : 'Não designado'}</span>
                            </button>
                          )}
                        </td>

                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {podeEditar ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setGestaoVmModal(l)}
                                  className="px-2.5 py-1 text-xs font-semibold bg-[#202020] hover:bg-[#2c2c2c] text-[#facc15] border border-[#3a3a3a] rounded-lg transition-colors cursor-pointer"
                                  title="Ficha completa de Governança do VM"
                                >
                                  {temVm ? 'Gerenciar VM' : '+ VM'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => abrirEdicaoLoja(l)}
                                  className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Editar dados cadastrais da Loja"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {userContext.is_diretoria && (
                                  <button
                                    type="button"
                                    onClick={() => removerLoja(l.loja_id)}
                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                    title="Desvincular Loja do Conselho"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-600 italic">Somente Leitura</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Rodapé da Tabela */}
          <div className="p-4 border-t border-[#262626] bg-[#101010] flex items-center justify-between flex-wrap gap-2 text-xs">
            <span className="text-gray-400">
              Mostrando <strong className="text-white">{lojasFiltradas.length}</strong> de <strong className="text-white">{totalLojas}</strong> lojas jurisdicionadas.
            </span>
            {userContext.is_diretoria && (
              <button
                type="button"
                onClick={() => setShowAddLojaModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 hover:bg-[#facc15]/20 border border-[#facc15]/30 px-3.5 py-1.5 rounded-lg transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Não encontrou a loja? Clique aqui para vincular
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Modal: Vincular Loja ao Conselho */}
      {showAddLojaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-xl shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/30">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Vincular Loja ao Conselho</h2>
                <p className="text-xs text-gray-400">Busque pelo nome ou número da loja no cadastro global do e-Sigma.</p>
              </div>
            </div>
            
            <BuscadorLoja onSelect={(loja) => vincularLoja(loja.id)} />
            
            <div className="flex justify-end mt-6 pt-4 border-t border-[#222]">
              <button 
                type="button"
                onClick={() => setShowAddLojaModal(false)} 
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gestão Completa de Venerável Mestre */}
      {gestaoVmModal && (
        <ModalGestaoVM 
          loja={gestaoVmModal}
          onSuccess={() => setReloadKey(k => k + 1)}
          onClose={() => setGestaoVmModal(null)}
        />
      )}

      {/* Modal: Cadastro de Venerável Mestre (Fallback) */}
      {addObreiroModal && (
        <ModalCadastroObreiro 
          cargoPadrao="Venerável Mestre"
          lojasDisponiveis={[{ id: parseInt(addObreiroModal.loja_id), nome: addObreiroModal.nome || 'Loja' }]}
          onSuccess={(cim: string) => {
            alert(`Venerável Mestre CIM ${cim} cadastrado com sucesso! E-mail com senha provisória enviado.`);
            setAddObreiroModal(null);
            setReloadKey(k => k + 1);
          }}
          onCancel={() => setAddObreiroModal(null)}
        />
      )}

      {/* Modal: Cadastro de Suplente */}
      {addSuplenteModal && (
        <ModalCadastroObreiro 
          cargoPadrao="Suplente"
          lojasDisponiveis={[{ id: parseInt(addSuplenteModal.loja_id), nome: addSuplenteModal.nome || 'Loja' }]}
          onSuccess={(cim: string) => {
            alert(`Suplente CIM ${cim} cadastrado com sucesso! E-mail com senha provisória enviado.`);
            setAddSuplenteModal(null);
            setReloadKey(k => k + 1);
          }}
          onCancel={() => setAddSuplenteModal(null)}
        />
      )}

      {/* Modal: Edição Cadastral da Loja */}
      {editLojaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/30">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Editar Cadastro da Loja</h2>
                <p className="text-xs text-gray-400">Atualize informações oficiais como Rito, Nome, Número e Oriente.</p>
              </div>
            </div>

            <form onSubmit={handleSalvarLoja} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Nome da Loja
                </label>
                <input 
                  type="text" 
                  required
                  value={editLojaForm.nome}
                  onChange={(e) => setEditLojaForm({...editLojaForm, nome: e.target.value})}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Número
                  </label>
                  <input 
                    type="text" 
                    required
                    value={editLojaForm.numero}
                    onChange={(e) => setEditLojaForm({...editLojaForm, numero: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Oriente (Cidade)
                  </label>
                  <input 
                    type="text" 
                    value={editLojaForm.cidade}
                    onChange={(e) => setEditLojaForm({...editLojaForm, cidade: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                  Rito Trabalhado
                </label>
                <select 
                  value={editLojaForm.rito}
                  onChange={(e) => setEditLojaForm({...editLojaForm, rito: e.target.value})}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-[#facc15] font-semibold focus:border-[#facc15] focus:outline-none"
                >
                  <option value="REAA">REAA</option>
                  <option value="Rito York">Rito de York</option>
                  <option value="Rito Adonhiramita">Rito Adonhiramita</option>
                  <option value="Rito Brasileiro">Rito Brasileiro</option>
                  <option value="Rito Moderno">Rito Moderno</option>
                  <option value="Rito Schroder">Rito Schröder</option>
                  <option value="Rito Escocês Retificado">Rito Escocês Retificado</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                <button 
                  type="button" 
                  onClick={() => setEditLojaModal(null)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={salvandoLoja}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {salvandoLoja ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Designação Livre de Suplente do Conselho */}
      {designarSuplenteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/30">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Designar Suplente do Conselho</h2>
                  <p className="text-xs text-gray-400">
                    {designarSuplenteModal.nome || `Loja ${designarSuplenteModal.loja_id}`} — escolha qualquer um dos 7 oficiais eletivos da loja.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDesignarSuplenteModal(null)}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-[#222] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {carregandoOficiais ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleDesignarSuplente} className="space-y-4">
                {oficiaisLoja.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-xs">
                    Nenhum oficial com mandato ativo encontrado para esta loja.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {oficiaisLoja.map((o: any) => (
                      <label
                        key={o.usuario_id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          suplenteEscolhido === o.usuario_id
                            ? 'bg-blue-500/10 border-blue-500/40'
                            : 'bg-[#161616] border-[#2a2a2a] hover:border-[#3a3a3a]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="suplente_escolhido"
                          value={o.usuario_id}
                          checked={suplenteEscolhido === o.usuario_id}
                          onChange={() => setSuplenteEscolhido(o.usuario_id)}
                          className="text-blue-400 focus:ring-blue-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{o.nome_completo}</div>
                          <div className="text-[11px] text-gray-400">{o.cargo} · CIM {o.usuario_id}</div>
                        </div>
                        {designarSuplenteModal.suplente_usuario_id === o.usuario_id && (
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider shrink-0">Atual</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#222]">
                  {designarSuplenteModal.suplente_nome ? (
                    <button
                      type="button"
                      onClick={handleRemoverSuplente}
                      disabled={salvandoSuplente}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Remover designação
                    </button>
                  ) : <span />}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDesignarSuplenteModal(null)}
                      className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={salvandoSuplente || !suplenteEscolhido || oficiaisLoja.length === 0}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {salvandoSuplente ? 'Salvando...' : 'Confirmar Designação'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
