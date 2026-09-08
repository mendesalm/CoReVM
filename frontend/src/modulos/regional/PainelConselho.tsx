// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Building2, Users, FileText, ArrowLeft, ShieldCheck, Loader2, 
  Award, Calendar, Edit3, Lock 
} from 'lucide-react';
import BuscadorLoja from '../../compartilhado/componentes/BuscadorLoja';
import ModalCadastroObreiro from '../../compartilhado/componentes/ModalCadastroObreiro';
import ModalGestaoVM from '../../compartilhado/componentes/ModalGestaoVM';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  // Modais
  const [gestaoVmModal, setGestaoVmModal] = useState<any>(null);
  const [addObreiroModal, setAddObreiroModal] = useState<any>(null);
  const [addSuplenteModal, setAddSuplenteModal] = useState<any>(null);
  const [showAddLojaModal, setShowAddLojaModal] = useState(false);
  const [showDiretoriaModal, setShowDiretoriaModal] = useState(false);
  const [editLojaModal, setEditLojaModal] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
      rito: loja.rito || 'Rito Escocês Antigo e Aceito',
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
      alert(err.response?.data?.detail || 'Erro ao atualizar dados da loja');
    } finally {
      setSalvandoLoja(false);
    }
  };

  // Form Diretoria
  const [diretoriaForm, setDiretoriaForm] = useState({
    presidente_id: '',
    vice_presidente_id: '',
    secretario_id: '',
    inicio_mandato: '',
    termino_mandato: ''
  });
  const [salvandoDiretoria, setSalvandoDiretoria] = useState(false);

  // Carregar dados completos do conselho, diretoria e permissões
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const headers = { 'X-User-Id': activeUserId };

      // 1. Contexto do usuário logado (RBAC)
      const userRes = await axios.get(`${API_URL}/regional/${id}/me`, { headers });
      setUserContext(userRes.data);

      // 2. Dados da Região e Lojas
      const [resDashboard, resDiretoria] = await Promise.all([
        axios.get(`${API_URL}/regional/${id}/dashboard`, { headers }),
        axios.get(`${API_URL}/regional/${id}/diretoria`, { headers })
      ]);

      const data = resDashboard.data;
      setDiretoria(resDiretoria.data || []);

      // Preenche form com valores atuais
      const pres = resDiretoria.data.find((d: any) => d.cargo.toLowerCase() === 'presidente');
      const vice = resDiretoria.data.find((d: any) => d.cargo.toLowerCase() === 'vice-presidente' || d.cargo.toLowerCase() === 'vice_presidente');
      const sec = resDiretoria.data.find((d: any) => d.cargo.toLowerCase() === 'secretario');
      
      setDiretoriaForm({
        presidente_id: pres?.usuario_id || '',
        vice_presidente_id: vice?.usuario_id || '',
        secretario_id: sec?.usuario_id || '',
        inicio_mandato: pres?.inicio_mandato || sec?.inicio_mandato || new Date().toISOString().split('T')[0],
        termino_mandato: pres?.termino_mandato || sec?.termino_mandato || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
      });

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
            return { ...l, nome: det?.nome, numero: det?.numero, cidade: det?.cidade, potencia: det?.potencia, rito: det?.rito, hasVm };
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
      setErro(err.response?.data?.detail || "Acesso negado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDashboard();
  }, [id, activeUserId, reloadKey]);

  // Vincular uma nova loja ao conselho (apenas Diretoria)
  const vincularLoja = async (lojaId: number) => {
    try {
      await axios.post(`${API_URL}/regional/${id}/lojas`, { loja_id: lojaId.toString() }, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert('Loja vinculada ao conselho com sucesso!');
      setShowAddLojaModal(false);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao vincular loja');
    }
  };

  // Remover uma loja do conselho (apenas Diretoria)
  const removerLoja = async (lojaId: string) => {
    if (!confirm('Deseja realmente remover esta loja do conselho?')) return;
    try {
      await axios.delete(`${API_URL}/regional/${id}/lojas/${lojaId}`, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert('Loja removida com sucesso!');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao remover loja');
    }
  };

  // Salvar alterações na Diretoria
  const handleSalvarDiretoria = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoDiretoria(true);
    try {
      await axios.put(`${API_URL}/regional/${id}/diretoria`, diretoriaForm, {
        headers: { 'X-User-Id': activeUserId }
      });
      alert('Composição da Diretoria e Mandatos atualizados com sucesso!');
      setShowDiretoriaModal(false);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao atualizar diretoria');
    } finally {
      setSalvandoDiretoria(false);
    }
  };

  // Membros destacados da mesa
  const presidente = diretoria.find(d => d.cargo.toLowerCase() === 'presidente');
  const vicePresidente = diretoria.find(d => d.cargo.toLowerCase() === 'vice-presidente' || d.cargo.toLowerCase() === 'vice_presidente');
  const secretario = diretoria.find(d => d.cargo.toLowerCase() === 'secretario');

  if (loading) return <div className="h-screen bg-[#080808] flex items-center justify-center"><Loader2 className="w-12 h-12 text-[#facc15] animate-spin" /></div>;
  if (erro) return <div className="h-screen bg-[#080808] flex items-center justify-center flex-col gap-4 text-orange-500 font-bold"><ShieldCheck className="w-16 h-16"/> {erro}</div>;

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200">
      {/* Topo / Header com Seletor de Simulação de RBAC */}
      <div className="bg-[#111] border-b border-[#333] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-[#222] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#facc15] uppercase tracking-widest">{conselho?.nome}</h1>
              <p className="text-xs text-green-500 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4"/> Perfil: <span className="font-bold text-white">{userContext.role}</span>
                {userContext.loja_id && ` (Representante Loja Ref: ${userContext.loja_id})`}
              </p>
            </div>
          </div>

          {/* Teste Rápido de RBAC (Dev Tool) */}
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-3 py-1.5 rounded-lg text-xs">
            <span className="text-gray-400 font-medium">Simular Acesso:</span>
            <select 
              value={activeUserId} 
              onChange={(e) => setActiveUserId(e.target.value)}
              className="bg-[#080808] text-[#facc15] border border-[#444] rounded px-2 py-1 font-semibold focus:outline-none"
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

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        
        {/* Seção: Mesa Diretora do Conselho */}
        <div className="bg-[#151515] border border-[#333] rounded-xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#facc15]/10 rounded-lg text-[#facc15]">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">Mesa Diretora do Conselho</h3>
                <p className="text-xs text-gray-400">Composição eleita e vigência do mandato regional</p>
              </div>
            </div>

            {userContext.is_diretoria && (
              <button 
                onClick={() => setShowDiretoriaModal(true)}
                className="flex items-center gap-2 text-xs font-semibold bg-[#222] hover:bg-[#333] text-[#facc15] px-3 py-2 rounded-lg border border-[#444] transition-all"
              >
                <Edit3 className="w-4 h-4" /> Gerenciar Mesa Diretora
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Presidente */}
            <div className="bg-[#111] p-4 rounded-lg border border-[#2a2a2a] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#facc15]/20 text-[#facc15] flex items-center justify-center font-bold text-sm shrink-0">
                P
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-[#facc15] uppercase tracking-wider block">Presidente</span>
                <p className="text-sm font-semibold text-white truncate" title={presidente?.nome_completo || 'Pendente de Nomeação'}>
                  {presidente?.nome_completo || (presidente?.usuario_id ? `CIM: ${presidente.usuario_id}` : 'Pendente')}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{presidente?.email || (presidente?.cim ? `CIM: ${presidente.cim}` : 'Sem dados')}</p>
              </div>
            </div>

            {/* Vice-Presidente */}
            <div className="bg-[#111] p-4 rounded-lg border border-[#2a2a2a] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                V
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Vice-Presidente</span>
                <p className="text-sm font-semibold text-white truncate" title={vicePresidente?.nome_completo || 'Pendente de Nomeação'}>
                  {vicePresidente?.nome_completo || (vicePresidente?.usuario_id ? `CIM: ${vicePresidente.usuario_id}` : 'Pendente')}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{vicePresidente?.email || (vicePresidente?.cim ? `CIM: ${vicePresidente.cim}` : 'Sem dados')}</p>
              </div>
            </div>

            {/* Secretário */}
            <div className="bg-[#111] p-4 rounded-lg border border-[#2a2a2a] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
                S
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Secretário</span>
                <p className="text-sm font-semibold text-white truncate" title={secretario?.nome_completo || 'Pendente de Nomeação'}>
                  {secretario?.nome_completo || (secretario?.usuario_id ? `CIM: ${secretario.usuario_id}` : 'Pendente')}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{secretario?.email || (secretario?.cim ? `CIM: ${secretario.cim}` : 'Sem dados')}</p>
              </div>
            </div>
          </div>

          {/* Vigência do Mandato */}
          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>Vigência do Mandato:</span>
              <span className="text-white font-medium">
                {presidente?.inicio_mandato || secretario?.inicio_mandato || '2026-09-08'} até {presidente?.termino_mandato || secretario?.termino_mandato || '2027-09-08'}
              </span>
            </div>
            <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded font-semibold text-[10px]">
              MANDATO ATIVO
            </span>
          </div>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg"><Building2 className="w-8 h-8 text-blue-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Lojas Jurisdicionadas</p>
              <h2 className="text-3xl font-bold text-white">{conselho?.lojas?.length || 0}</h2>
            </div>
          </div>
          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg"><Users className="w-8 h-8 text-green-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Veneráveis Cadastrados</p>
              <h2 className="text-3xl font-bold text-white">{conselho?.lojas?.filter((l: any) => l.hasVm).length || 0}</h2>
            </div>
          </div>
          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-lg"><FileText className="w-8 h-8 text-purple-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Atas Recebidas</p>
              <h2 className="text-3xl font-bold text-white">0</h2>
            </div>
          </div>
        </div>

        {/* Tabela de Lojas Jurisdicionadas */}
        <div className="bg-[#151515] border border-[#333] rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-[#facc15]">Lojas do Conselho</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {userContext.is_diretoria 
                  ? "Modo Diretoria: você possui permissão total de gestão em todas as lojas." 
                  : `Modo Representante: permissão de edição restrita à sua Loja Ref: ${userContext.loja_id}.`}
              </p>
            </div>
            {userContext.is_diretoria && (
              <button 
                onClick={() => setShowAddLojaModal(true)} 
                className="bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                + Adicionar Loja
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#333] text-sm text-gray-500 uppercase">
                  <th className="p-3">Loja</th>
                  <th className="p-3">Potência</th>
                  <th className="p-3">Oriente</th>
                  <th className="p-3">Rito</th>
                  <th className="p-3">Venerável Mestre</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {conselho?.lojas?.map((rel: any) => {
                  const isMyLodge = userContext.is_diretoria || String(userContext.loja_id) === String(rel.loja_id);
                  return (
                    <tr 
                      key={rel.id} 
                      className={`border-b border-[#222] transition-colors text-xs ${isMyLodge ? 'hover:bg-[#1a1a1a]' : 'opacity-70'}`}
                    >
                      <td className="p-3 font-medium text-white flex items-center gap-2">
                        {isMyLodge && !userContext.is_diretoria && (
                          <span className="p-1 bg-[#facc15]/20 text-[#facc15] rounded text-[10px] font-bold" title="Sua Loja">
                            SUA LOJA
                          </span>
                        )}
                        <span>{rel.nome ? `${rel.nome.replace(/^Loja\s+/i, '')}, nº ${rel.numero}` : `Ref: ${rel.loja_id}`}</span>
                      </td>
                      <td className="p-3 text-gray-400">{rel.potencia || '-'}</td>
                      <td className="p-3 text-gray-400">{rel.cidade || '-'}</td>
                      <td className="p-3 text-gray-400 truncate max-w-[150px]" title={rel.rito}>{rel.rito ? rel.rito.replace(/^Rito\s+/i, '') : '-'}</td>
                      <td className="p-3">
                        {rel.hasVm ? (
                          <button
                            onClick={() => isMyLodge ? setGestaoVmModal({
                              id: parseInt(rel.loja_id),
                              nome: rel.nome,
                              numero: rel.numero,
                              rito: rel.rito,
                              potencia: rel.potencia,
                              hasVm: rel.hasVm
                            }) : null}
                            disabled={!isMyLodge}
                            className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                              isMyLodge 
                                ? 'bg-[#1a1a1a] hover:bg-[#252525] border border-green-500/40 text-green-400 hover:text-green-300 cursor-pointer shadow-sm' 
                                : 'bg-[#222] text-green-400 opacity-80 cursor-default'
                            }`}
                            title={isMyLodge ? "Clique para gerenciar o Venerável Mestre" : rel.hasVm}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                            <span className="truncate max-w-[150px]">{rel.hasVm}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => isMyLodge ? setGestaoVmModal({
                              id: parseInt(rel.loja_id),
                              nome: rel.nome,
                              numero: rel.numero,
                              rito: rel.rito,
                              potencia: rel.potencia,
                              hasVm: null
                            }) : null}
                            disabled={!isMyLodge}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                              isMyLodge
                                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 cursor-pointer border border-red-500/30'
                                : 'bg-red-500/20 text-red-400 opacity-80 cursor-default'
                            }`}
                            title={isMyLodge ? "Clique para cadastrar o Venerável Mestre" : "Pendente"}
                          >
                            Pendente
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1 whitespace-nowrap">
                        {/* Botão Remover (Exclusivo Diretoria) */}
                        {userContext.is_diretoria && (
                          <button 
                            onClick={() => removerLoja(rel.loja_id)} 
                            className="text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-1 rounded"
                            title="Remover loja do conselho"
                          >
                            Remover
                          </button>
                        )}

                        {/* Botão Editar (Diretoria ou Representante da Própria Loja) */}
                        <button 
                          onClick={() => isMyLodge ? abrirEdicaoLoja(rel) : null}
                          disabled={!isMyLodge}
                          className={`px-2 py-1 rounded transition-all ${
                            isMyLodge 
                              ? 'text-blue-400 hover:text-blue-300 bg-blue-500/10 cursor-pointer' 
                              : 'text-gray-600 bg-gray-800/30 cursor-not-allowed opacity-40'
                          }`}
                          title={isMyLodge ? "Editar dados cadastrais da loja" : "Apenas o representante desta loja pode editar"}
                        >
                          {!isMyLodge && <Lock className="w-3 h-3 inline mr-1" />}
                          Editar
                        </button>

                        {/* Botão Gerenciar VM / + VM (Habilitado apenas para Diretoria ou Representante da Própria Loja) */}
                        <button 
                          onClick={() => isMyLodge ? setGestaoVmModal({
                            id: parseInt(rel.loja_id),
                            nome: rel.nome,
                            numero: rel.numero,
                            rito: rel.rito,
                            potencia: rel.potencia,
                            hasVm: rel.hasVm
                          }) : null}
                          disabled={!isMyLodge}
                          className={`px-2 py-1 rounded transition-all ${
                            isMyLodge 
                              ? 'text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 cursor-pointer' 
                              : 'text-gray-600 bg-gray-800/30 cursor-not-allowed opacity-40'
                          }`}
                          title={isMyLodge ? (rel.hasVm ? "Gerenciar Venerável Mestre (Visualizar, Editar, Destituir ou Substituir)" : "Cadastrar Venerável Mestre") : "Apenas o representante desta loja pode cadastrar"}
                        >
                          {!isMyLodge && <Lock className="w-3 h-3 inline mr-1" />}
                          {rel.hasVm ? 'Gerenciar VM' : '+ VM'}
                        </button>

                        {/* Botão + Suplente (Habilitado apenas para Diretoria ou Representante da Própria Loja) */}
                        <button 
                          onClick={() => isMyLodge ? setAddSuplenteModal(rel) : null}
                          disabled={!isMyLodge}
                          className={`px-2 py-1 rounded transition-all ${
                            isMyLodge 
                              ? 'text-purple-400 hover:text-purple-300 bg-purple-500/10 cursor-pointer' 
                              : 'text-gray-600 bg-gray-800/30 cursor-not-allowed opacity-40'
                          }`}
                          title={isMyLodge ? "Cadastrar Suplente da Loja" : "Apenas o representante desta loja pode cadastrar"}
                        >
                          {!isMyLodge && <Lock className="w-3 h-3 inline mr-1" />}
                          + Suplente
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {conselho?.lojas?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">Nenhuma loja cadastrada neste conselho ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
      </div>

      {/* Modal: Gerenciar Mesa Diretora e Mandato */}
      {showDiretoriaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-[#333] rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15]">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Gerenciar Mesa Diretora</h2>
                <p className="text-xs text-gray-400">Defina os membros titulares e o período do mandato</p>
              </div>
            </div>

            <form onSubmit={handleSalvarDiretoria} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                  Presidente do Conselho (CIM)
                </label>
                <input 
                  type="text" 
                  value={diretoriaForm.presidente_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, presidente_id: e.target.value})}
                  placeholder="Informe o CIM do Presidente eleito..."
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                  Vice-Presidente (CIM)
                </label>
                <input 
                  type="text" 
                  value={diretoriaForm.vice_presidente_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, vice_presidente_id: e.target.value})}
                  placeholder="Informe o CIM do Vice-Presidente..."
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                  Secretário do Conselho (CIM)
                </label>
                <input 
                  type="text" 
                  value={diretoriaForm.secretario_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, secretario_id: e.target.value})}
                  placeholder="Informe o CIM do Secretário..."
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-purple-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Início do Mandato</label>
                  <input 
                    type="date"
                    required
                    value={diretoriaForm.inicio_mandato}
                    onChange={(e) => setDiretoriaForm({...diretoriaForm, inicio_mandato: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Término do Mandato</label>
                  <input 
                    type="date"
                    required
                    value={diretoriaForm.termino_mandato}
                    onChange={(e) => setDiretoriaForm({...diretoriaForm, termino_mandato: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                <button 
                  type="button" 
                  onClick={() => setShowDiretoriaModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={salvandoDiretoria}
                  className="bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {salvandoDiretoria ? 'Gravando...' : 'Salvar Mandato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Loja ao Conselho */}
      {showAddLojaModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-xl">
            <h2 className="text-xl font-bold text-[#facc15] mb-2">Adicionar Loja ao Conselho</h2>
            <p className="text-sm text-gray-400 mb-6">Busque pelo nome ou número da loja no banco global.</p>
            <BuscadorLoja onSelect={(loja) => vincularLoja(loja.id)} />
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowAddLojaModal(false)} className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gestão Completa de Venerável Mestre (Visualizar, Editar, Encerrar, Substituir) */}
      {gestaoVmModal && (
        <ModalGestaoVM 
          loja={gestaoVmModal}
          onSuccess={() => {
            setReloadKey(k => k + 1);
          }}
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
          <div className="bg-[#111] border border-[#333] rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Editar Cadastro da Loja</h2>
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
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
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
                    className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
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
                    className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
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
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-[#facc15] font-semibold focus:border-[#facc15] focus:outline-none"
                >
                  <option value="Rito Escocês Antigo e Aceito">Rito Escocês Antigo e Aceito</option>
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
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={salvandoLoja}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {salvandoLoja ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
