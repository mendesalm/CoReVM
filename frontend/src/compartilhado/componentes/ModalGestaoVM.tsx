// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Award, Calendar, Edit3, Trash2, CheckCircle2, 
  AlertCircle, Loader2, X, Mail, Phone, 
  UserCheck, History, Sparkles, ShieldAlert
} from 'lucide-react';
import { formatarCPF, formatarTelefone } from '../utils/formatadores';

interface ModalGestaoVMProps {
  loja: {
    id: number;
    nome: string;
    numero: string;
    rito?: string;
    potencia?: string;
    hasVm?: string | null;
  };
  onSuccess: () => void;
  onClose: () => void;
}

const API_URL = 'http://localhost:8003/api/v1';

export default function ModalGestaoVM({ loja, onSuccess, onClose }: ModalGestaoVMProps) {
  const [activeTab, setActiveTab] = useState<'visualizar' | 'substituir' | 'historico'>('visualizar');
  const [loading, setLoading] = useState(true);
  const [vmData, setVmData] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  
  // Modo de Edição do Mandato Vigente
  const [isEditing, setIsEditing] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    email: '',
    cpf: '',
    telefone: '',
    data_inicio: ''
  });

  // Formulário de Nova Gestão / Substituição de VM
  const [novaGestaoForm, setNovaGestaoForm] = useState({
    cim: '',
    nome_completo: '',
    email: '',
    cpf: '',
    telefone: '',
    data_inicio_mandato: new Date().toISOString().split('T')[0]
  });
  const [buscandoCim, setBuscandoCim] = useState(false);
  const [obreiroLocalizado, setObreiroLocalizado] = useState<boolean | null>(null);
  const [mensagemBusca, setMensagemBusca] = useState('');
  const [salvandoNovaGestao, setSalvandoNovaGestao] = useState(false);

  // Encerramento de Mandato
  const [encerrandoMandato, setEncerrandoMandato] = useState(false);

  // Carrega os dados do VM ativo e do histórico da loja
  const carregarDados = async () => {
    setLoading(true);
    try {
      const [resVm, resHist] = await Promise.all([
        axios.get(`${API_URL}/integracao/lojas/${loja.id}/vm`),
        axios.get(`${API_URL}/integracao/lojas/${loja.id}/vm/historico`)
      ]);

      const vm = resVm.data;
      setVmData(vm);
      setHistorico(resHist.data || []);

      if (vm.tem_vm) {
        setEditForm({
          nome_completo: vm.nome_completo || '',
          email: vm.email || '',
          cpf: vm.cpf ? formatarCPF(vm.cpf) : '',
          telefone: vm.telefone ? formatarTelefone(vm.telefone) : '',
          data_inicio: vm.data_inicio || ''
        });
        setActiveTab('visualizar');
      } else {
        setActiveTab('substituir');
      }
    } catch (err) {
      console.error('Erro ao carregar dados do VM:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [loja.id]);

  // Busca instantânea por CIM para Nova Gestão
  const buscarPorCim = async (cimValue: string) => {
    const termo = cimValue.trim();
    if (termo.length < 3) {
      setObreiroLocalizado(null);
      setMensagemBusca('');
      return;
    }

    setBuscandoCim(true);
    try {
      const res = await axios.get(`${API_URL}/integracao/obreiros/busca/${termo}`);
      const o = res.data;
      setNovaGestaoForm(prev => ({
        ...prev,
        nome_completo: o.nome_completo || prev.nome_completo,
        email: o.email || prev.email,
        cpf: o.cpf ? formatarCPF(o.cpf) : prev.cpf,
        telefone: o.telefone ? formatarTelefone(o.telefone) : prev.telefone
      }));
      setObreiroLocalizado(true);
      setMensagemBusca(`Irmão localizado: ${o.nome_completo}`);
    } catch (err) {
      setObreiroLocalizado(false);
      setMensagemBusca('Novo obreiro no e-Sigma. Digite os dados para cadastro inicial.');
    } finally {
      setBuscandoCim(false);
    }
  };

  const handleCimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawCim = e.target.value.replace(/\D/g, '');
    setNovaGestaoForm({ ...novaGestaoForm, cim: rawCim });
    buscarPorCim(rawCim);
  };

  // Salvar Edição do VM Atual
  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoEdicao(true);
    try {
      const payload = {
        nome_completo: editForm.nome_completo,
        email: editForm.email,
        cpf: editForm.cpf ? editForm.cpf.replace(/\D/g, '') : null,
        telefone: editForm.telefone ? editForm.telefone.replace(/\D/g, '') : null,
        data_inicio: editForm.data_inicio || null
      };

      await axios.put(`${API_URL}/integracao/lojas/${loja.id}/vm`, payload);
      alert('Dados do Venerável Mestre e vigência do mandato atualizados com sucesso!');
      setIsEditing(false);
      await carregarDados();
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao atualizar dados do Venerável Mestre.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Encerrar / Destituir Mandato Atual
  const handleEncerrarMandato = async () => {
    const confirmacao = window.confirm(
      `Atenção: Confirma o encerramento do mandato do Ir. ${vmData?.nome_completo}?
A loja voltará ao status 'Pendente' até que um novo Venerável Mestre seja empossado.`
    );
    if (!confirmacao) return;

    setEncerrandoMandato(true);
    try {
      await axios.delete(`${API_URL}/integracao/lojas/${loja.id}/vm`);
      alert('Mandato de Venerável Mestre encerrado com sucesso. Status retornado para Pendente.');
      await carregarDados();
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao encerrar mandato.');
    } finally {
      setEncerrandoMandato(false);
    }
  };

  // Empossar Novo Venerável Mestre (Nova Gestão)
  const handleEmpossarNovoVM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaGestaoForm.cim || !novaGestaoForm.nome_completo || !novaGestaoForm.email) {
      alert('Por favor, preencha os campos obrigatórios: CIM, Nome Completo e E-mail.');
      return;
    }

    setSalvandoNovaGestao(true);
    try {
      const payload = {
        cim: novaGestaoForm.cim,
        nome_completo: novaGestaoForm.nome_completo,
        email: novaGestaoForm.email,
        cpf: novaGestaoForm.cpf ? novaGestaoForm.cpf.replace(/\D/g, '') : null,
        telefone: novaGestaoForm.telefone ? novaGestaoForm.telefone.replace(/\D/g, '') : null,
        loja_id: loja.id,
        cargo_atual: 'Venerável Mestre',
        data_inicio_mandato: novaGestaoForm.data_inicio_mandato
      };

      await axios.post(`${API_URL}/integracao/obreiros/`, payload);
      alert(`Novo Venerável Mestre (Ir. ${novaGestaoForm.nome_completo}) empossado com sucesso!`);
      setNovaGestaoForm({
        cim: '',
        nome_completo: '',
        email: '',
        cpf: '',
        telefone: '',
        data_inicio_mandato: new Date().toISOString().split('T')[0]
      });
      setObreiroLocalizado(null);
      setMensagemBusca('');
      await carregarDados();
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao empossar novo Venerável Mestre.');
    } finally {
      setSalvandoNovaGestao(false);
    }
  };

  const formatarDataBR = (dataStr?: string) => {
    if (!dataStr) return '-';
    const partes = dataStr.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
      <div className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Topo do Modal */}
        <div className="bg-gradient-to-r from-[#181818] via-[#141414] to-[#181818] p-5 border-b border-[#2b2b2b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#facc15]/10 border border-[#facc15]/30 rounded-xl text-[#facc15]">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Gestão do Venerável Mestre
                </h2>
                <span className="bg-[#222] text-[#facc15] text-[11px] font-bold px-2 py-0.5 rounded border border-[#444]">
                  Loja {loja.numero}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {loja.nome ? `${loja.nome.replace(/^Loja\s+/i, '')}, nº ${loja.numero}` : `Loja ID ${loja.id}`}
                {loja.rito && ` • ${loja.rito.replace(/^Rito\s+/i, '')}`}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#222] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-[#2b2b2b] bg-[#141414] px-5">
          <button
            type="button"
            onClick={() => setActiveTab('visualizar')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'visualizar'
                ? 'border-[#facc15] text-[#facc15] bg-[#1c1c1c]/50'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <UserCheck className="w-4 h-4" /> Mandato Vigente
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('substituir')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'substituir'
                ? 'border-[#facc15] text-[#facc15] bg-[#1c1c1c]/50'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> 
            {vmData?.tem_vm ? 'Substituir VM (Nova Gestão)' : 'Empossar Venerável Mestre'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'historico'
                ? 'border-[#facc15] text-[#facc15] bg-[#1c1c1c]/50'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="w-4 h-4" /> Galeria de Gestões ({historico.length})
          </button>
        </div>

        {/* Conteúdo Principal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
              <Loader2 className="w-8 h-8 text-[#facc15] animate-spin" />
              <p className="text-xs">Consultando registros maçônicos...</p>
            </div>
          ) : (
            <>
              {/* ABA 1: MANDATO VIGENTE (VISUALIZAR E EDITAR) */}
              {activeTab === 'visualizar' && (
                <div>
                  {vmData?.tem_vm ? (
                    !isEditing ? (
                      /* Cartão de Visualização */
                      <div className="space-y-4">
                        <div className="bg-gradient-to-br from-[#1c1a12] via-[#141414] to-[#161616] border border-[#facc15]/30 rounded-xl p-5 shadow-lg relative overflow-hidden">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                Mandato Ativo
                              </span>
                              <h3 className="text-xl font-bold text-white pt-1">
                                {vmData.nome_completo}
                              </h3>
                              <p className="text-xs text-[#facc15] font-semibold">
                                Venerável Mestre • CIM: <span className="text-white font-mono">{vmData.cim}</span>
                              </p>
                            </div>
                            <div className="p-3 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/20">
                              <Award className="w-8 h-8" />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t border-[#2b2b2b] text-xs">
                            <div className="flex items-center gap-2 text-gray-300">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-400">E-mail:</span>
                              <span className="text-white font-medium truncate">{vmData.email || 'Não informado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-400">Telefone:</span>
                              <span className="text-white font-medium">{vmData.telefone ? formatarTelefone(vmData.telefone) : 'Não informado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                              <UserCheck className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-400">CPF:</span>
                              <span className="text-white font-medium">{vmData.cpf ? formatarCPF(vmData.cpf) : 'Não informado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                              <Calendar className="w-4 h-4 text-[#facc15]" />
                              <span className="text-gray-400">Posse / Início:</span>
                              <span className="text-[#facc15] font-bold">{formatarDataBR(vmData.data_inicio)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            onClick={handleEncerrarMandato}
                            disabled={encerrandoMandato}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            {encerrandoMandato ? 'Encerrando...' : 'Encerrar Mandato / Destituir'}
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsEditing(true)}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[#facc15] hover:text-black bg-[#facc15]/10 hover:bg-[#facc15] border border-[#facc15]/30 transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                              Editar Informações
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Formulário de Edição do Mandato Vigente */
                      <form onSubmit={handleSalvarEdicao} className="space-y-4">
                        <div className="bg-[#181818] border border-[#333] rounded-xl p-4 mb-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-[#facc15] font-semibold">Editando cadastro do Venerável Mestre</p>
                              <p className="text-sm font-bold text-white">CIM: {vmData.cim}</p>
                            </div>
                            <span className="text-[11px] text-gray-400 italic">
                              Fonte Única da Verdade: dados propagam para todas as lojas vinculadas.
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                            Nome Completo *
                          </label>
                          <input 
                            type="text"
                            required
                            value={editForm.nome_completo}
                            onChange={(e) => setEditForm({...editForm, nome_completo: e.target.value})}
                            className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                              E-mail *
                            </label>
                            <input 
                              type="email"
                              required
                              value={editForm.email}
                              onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                              className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                              Telefone / WhatsApp
                            </label>
                            <input 
                              type="text"
                              value={editForm.telefone}
                              onChange={(e) => setEditForm({...editForm, telefone: formatarTelefone(e.target.value)})}
                              className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                              CPF
                            </label>
                            <input 
                              type="text"
                              value={editForm.cpf}
                              onChange={(e) => setEditForm({...editForm, cpf: formatarCPF(e.target.value)})}
                              className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                              placeholder="000.000.000-00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                              Data de Início do Mandato
                            </label>
                            <input 
                              type="date"
                              value={editForm.data_inicio}
                              onChange={(e) => setEditForm({...editForm, data_inicio: e.target.value})}
                              className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-[#facc15] font-semibold focus:border-[#facc15] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={salvandoEdicao}
                            className="bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {salvandoEdicao && <Loader2 className="w-4 h-4 animate-spin" />}
                            {salvandoEdicao ? 'Gravando...' : 'Salvar Alterações'}
                          </button>
                        </div>
                      </form>
                    )
                  ) : (
                    /* Sem VM Ativo */
                    <div className="text-center py-10 space-y-4 bg-[#151515] border border-dashed border-[#333] rounded-xl p-8">
                      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white">Nenhum Venerável Mestre Ativo</h4>
                        <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                          Esta loja está com status <span className="text-red-400 font-bold">Pendente</span> no Conselho.
                          Emposse um Venerável Mestre para habilitar a governança local e a representação plena.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('substituir')}
                        className="inline-flex items-center gap-2 bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2.5 rounded-lg font-bold text-xs transition-colors shadow-lg"
                      >
                        <Sparkles className="w-4 h-4" /> Empossar Venerável Mestre
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: SUBSTITUIR VM / NOVA GESTÃO */}
              {activeTab === 'substituir' && (
                <form onSubmit={handleEmpossarNovoVM} className="space-y-4">
                  {vmData?.tem_vm && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-200">
                        <span className="font-bold">Transição de Gestão:</span> Ao confirmar a posse do novo Venerável Mestre, o mandato do Ir. <span className="font-bold underline">{vmData.nome_completo}</span> será automaticamente finalizado na data de hoje e registrado na Galeria Histórica.
                      </p>
                    </div>
                  )}

                  {/* Campo CIM com Busca Instantânea */}
                  <div>
                    <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                      CIM do Novo Venerável Mestre *
                    </label>
                    <div className="relative">
                      <input 
                        type="text"
                        required
                        value={novaGestaoForm.cim}
                        onChange={handleCimChange}
                        placeholder="Digite o CIM (ex: 292936)"
                        className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white font-mono focus:border-[#facc15] focus:outline-none pr-10"
                      />
                      <div className="absolute right-3 top-2.5 text-gray-400">
                        {buscandoCim ? (
                          <Loader2 className="w-5 h-5 text-[#facc15] animate-spin" />
                        ) : obreiroLocalizado === true ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        ) : obreiroLocalizado === false ? (
                          <AlertCircle className="w-5 h-5 text-blue-400" />
                        ) : null}
                      </div>
                    </div>
                    {mensagemBusca && (
                      <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${obreiroLocalizado ? 'text-green-400 font-medium' : 'text-gray-400'}`}>
                        {obreiroLocalizado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5 text-gray-500" />}
                        {mensagemBusca}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Nome Completo do Irmão *
                    </label>
                    <input 
                      type="text"
                      required
                      value={novaGestaoForm.nome_completo}
                      onChange={(e) => setNovaGestaoForm({...novaGestaoForm, nome_completo: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        E-mail *
                      </label>
                      <input 
                        type="email"
                        required
                        value={novaGestaoForm.email}
                        onChange={(e) => setNovaGestaoForm({...novaGestaoForm, email: e.target.value})}
                        className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        Telefone / WhatsApp (Opcional)
                      </label>
                      <input 
                        type="text"
                        value={novaGestaoForm.telefone}
                        onChange={(e) => setNovaGestaoForm({...novaGestaoForm, telefone: formatarTelefone(e.target.value)})}
                        className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        CPF (Opcional)
                      </label>
                      <input 
                        type="text"
                        value={novaGestaoForm.cpf}
                        onChange={(e) => setNovaGestaoForm({...novaGestaoForm, cpf: formatarCPF(e.target.value)})}
                        className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                        placeholder="000.000.000-00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                        Data de Posse / Início do Mandato *
                      </label>
                      <input 
                        type="date"
                        required
                        value={novaGestaoForm.data_inicio_mandato}
                        onChange={(e) => setNovaGestaoForm({...novaGestaoForm, data_inicio_mandato: e.target.value})}
                        className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-[#facc15] font-semibold focus:border-[#facc15] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={salvandoNovaGestao}
                      className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2.5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg"
                    >
                      {salvandoNovaGestao && <Loader2 className="w-4 h-4 animate-spin" />}
                      {salvandoNovaGestao ? 'Processando Posse...' : 'Confirmar Posse / Nova Gestão'}
                    </button>
                  </div>
                </form>
              )}

              {/* ABA 3: HISTÓRICO DE MANDATOS */}
              {activeTab === 'historico' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Registro Cronológico de Veneráveis Mestres
                    </h4>
                    <span className="text-xs text-gray-500 font-mono">Total: {historico.length}</span>
                  </div>

                  {historico.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs">
                      Nenhum registro de mandato cadastrado nesta loja.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#222]">
                      {historico.map((m: any) => (
                        <div key={m.mandato_id} className="py-3 flex items-center justify-between hover:bg-[#161616] px-2 rounded-lg transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{m.nome_completo}</span>
                              <span className="text-[11px] text-gray-400 font-mono">CIM: {m.cim}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <Calendar className="w-3.5 h-3.5 text-[#facc15]" />
                              <span>Início: {formatarDataBR(m.data_inicio)}</span>
                              <span>•</span>
                              <span>Término: {m.ativo ? 'Vigente' : formatarDataBR(m.data_fim)}</span>
                            </div>
                          </div>
                          <div>
                            {m.ativo ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                                Mandato Ativo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400">
                                Concluído
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
