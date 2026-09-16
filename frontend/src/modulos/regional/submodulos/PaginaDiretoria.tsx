// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import { clienteHttp } from '../../../compartilhado/contextos/AuthContext';
import { useParams, Link } from 'react-router-dom';
import {
  Award, ShieldCheck, Loader2, Calendar,
  Edit3, ArrowLeft, CheckCircle2, UserCheck, Shield, AlertTriangle, Zap
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

// CORREÇÃO (2026-09-14, bug reportado em teste): esta página nunca tinha
// sido migrada para o login real contra o e-Sigma (fix de segurança de
// 2026-09-11, ver PaginaLojas.tsx e PainelConselho.tsx) — ainda usava
// `axios` puro com um seletor "Simular Acesso" enviando um header
// `X-User-Id` não autenticado. Como toda rota de `/regional` agora exige
// `Authorization: Bearer` real (via `get_current_regional_user` /
// `obter_usuario_esigma`, ambos com `Header(...)` obrigatório), a ausência
// desse header fazia o FastAPI devolver 422 (erro de validação, não 401/403)
// em toda chamada — e o `detail` desse 422 é uma LISTA de objetos de erro,
// não uma string, o que quebrava a página ao tentar renderizá-lo direto
// como filho de um elemento React ("Objects are not valid as a React
// child"). Corrigido: usa `clienteHttp` (injeta o token real do login) e
// normaliza qualquer formato de erro do backend antes de exibir.
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

export default function PaginaDiretoria() {
  const { id } = useParams();
  const [conselho, setConselho] = useState<any>(null);
  const [diretoria, setDiretoria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Contexto de Usuário e RBAC — vem de /regional/{id}/me (Authorization
  // real), preenchido depois do fetchData. Nada de simulação por aqui.
  const [userContext, setUserContext] = useState<any>({
    usuario_id: null,
    role: null,
    is_diretoria: false,
    loja_id: null
  });

  // Modal Diretoria
  const [showDiretoriaModal, setShowDiretoriaModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [salvandoDiretoria, setSalvandoDiretoria] = useState(false);
  const [diretoriaForm, setDiretoriaForm] = useState({
    presidente_id: '',
    vice_presidente_id: '',
    secretario_id: '',
    inicio_mandato: '',
    termino_mandato: ''
  });

  // ALTERAÇÃO (2026-09-14, bug reportado em teste): antes o formulário
  // aceitava qualquer CIM digitado livremente, sem preview nem validação —
  // foi possível designar um membro aleatório, inclusive um CIM inexistente.
  // Agora os 3 campos são seletores populados só com os Veneráveis Mestres
  // em exercício das Lojas jurisdicionadas ao Conselho
  // (GET /veneraveis-elegiveis), a mesma validação que o backend também
  // aplica (defesa em profundidade).
  const [veneraveisElegiveis, setVeneraveisElegiveis] = useState<any[]>([]);

  // Assento "órfão": quando a Loja que um membro da Diretoria representava
  // trocou de Venerável Mestre (ou ficou sem VM) e a Diretoria não foi
  // atualizada. Estado do seletor emergencial (por cargo).
  const [emergenciaCargoAberto, setEmergenciaCargoAberto] = useState<string | null>(null);
  const [emergenciaSelecionado, setEmergenciaSelecionado] = useState('');
  const [salvandoEmergencia, setSalvandoEmergencia] = useState(false);

  // Carregar dados
  const fetchData = async () => {
    setLoading(true);
    try {
      const [userRes, resDashboard, resDiretoria, resElegiveis] = await Promise.all([
        clienteHttp.get(`${API_URL}/regional/${id}/me`),
        clienteHttp.get(`${API_URL}/regional/${id}/dashboard`),
        clienteHttp.get(`${API_URL}/regional/${id}/diretoria`),
        clienteHttp.get(`${API_URL}/regional/${id}/veneraveis-elegiveis`)
      ]);

      setUserContext(userRes.data);
      setConselho(resDashboard.data);
      setDiretoria(resDiretoria.data || []);
      setVeneraveisElegiveis(resElegiveis.data || []);

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

    } catch (err: any) {
      setErro(extrairMensagemErro(err, "Erro ao carregar diretoria."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id, reloadKey]);

  // Salvar alterações na Diretoria
  const handleSalvarDiretoria = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoDiretoria(true);
    try {
      await clienteHttp.put(`${API_URL}/regional/${id}/diretoria`, diretoriaForm);
      alert('Composição da Diretoria e Mandatos atualizados com sucesso!');
      setShowDiretoriaModal(false);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao atualizar diretoria'));
    } finally {
      setSalvandoDiretoria(false);
    }
  };

  // Substitui emergencialmente um único assento (sem afetar os outros
  // dois), usado quando o card mostra o aviso de assento órfão — tanto
  // para aceitar a sugestão automática (mesmo botão de aviso) quanto para
  // apontar manualmente outro Venerável Mestre elegível.
  const handleAtualizarEmergencia = async (cargoValor: string, usuarioId: string) => {
    if (!usuarioId) return;
    setSalvandoEmergencia(true);
    try {
      await clienteHttp.put(`${API_URL}/regional/${id}/diretoria/${cargoValor}/emergencia`, { usuario_id: usuarioId });
      setEmergenciaCargoAberto(null);
      setEmergenciaSelecionado('');
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao atualizar o assento emergencialmente'));
    } finally {
      setSalvandoEmergencia(false);
    }
  };

  const presidente = diretoria.find(d => d.cargo.toLowerCase() === 'presidente');
  const vicePresidente = diretoria.find(d => d.cargo.toLowerCase() === 'vice-presidente' || d.cargo.toLowerCase() === 'vice_presidente');
  const secretario = diretoria.find(d => d.cargo.toLowerCase() === 'secretario');

  // Aviso de assento órfão exibido no card do respectivo cargo — cobre os
  // dois casos: a Loja já tem um novo VM (sugestão pronta, um clique
  // resolve) ou a Loja ficou sem VM (é preciso escolher manualmente
  // qualquer Venerável elegível, de forma emergencial, para a Loja não
  // ficar sem representação).
  const renderAvisoOrfao = (membro: any, cargoValor: string) => {
    if (!membro || (!membro.vinculo_desatualizado && !membro.loja_sem_vm)) return null;
    const aberto = emergenciaCargoAberto === cargoValor;
    return (
      <div className="mt-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[11px] space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {membro.vinculo_desatualizado && membro.sugestao_novo_veneravel ? (
            <span>
              A Loja {membro.loja_numero ? `nº ${membro.loja_numero}` : ''} já possui novo Venerável Mestre
              (<strong>{membro.sugestao_novo_veneravel.nome_completo || membro.sugestao_novo_veneravel.usuario_id}</strong>),
              mas a Diretoria ainda não foi atualizada.
            </span>
          ) : (
            <span>
              A Loja {membro.loja_numero ? `nº ${membro.loja_numero}` : ''} que este titular representava está
              sem Venerável Mestre empossado. Escolha emergencialmente outro Venerável elegível para não deixar
              este assento sem representação.
            </span>
          )}
        </div>

        {membro.vinculo_desatualizado && membro.sugestao_novo_veneravel && !aberto && (
          <button
            type="button"
            disabled={salvandoEmergencia}
            onClick={() => handleAtualizarEmergencia(cargoValor, membro.sugestao_novo_veneravel.usuario_id)}
            className="inline-flex items-center gap-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" /> Atualizar para o novo VM
          </button>
        )}

        {!aberto ? (
          <button
            type="button"
            onClick={() => { setEmergenciaCargoAberto(cargoValor); setEmergenciaSelecionado(''); }}
            className="text-orange-300 underline underline-offset-2 hover:text-orange-100 cursor-pointer"
          >
            Escolher outro Venerável manualmente
          </button>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <select
              value={emergenciaSelecionado}
              onChange={(e) => setEmergenciaSelecionado(e.target.value)}
              className="w-full bg-[#080808] border border-orange-500/40 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-orange-400"
            >
              <option value="">Selecione um Venerável Mestre elegível...</option>
              {veneraveisElegiveis.map((v) => (
                <option key={v.usuario_id} value={v.usuario_id}>
                  {v.nome_completo || v.usuario_id} — Loja {v.loja_numero || v.loja_id}
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEmergenciaCargoAberto(null)}
                className="px-3 py-1.5 text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!emergenciaSelecionado || salvandoEmergencia}
                onClick={() => handleAtualizarEmergencia(cargoValor, emergenciaSelecionado)}
                className="bg-orange-500 hover:bg-orange-400 text-black font-bold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {salvandoEmergencia ? 'Gravando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
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
      
      {/* Sub-Header Contextual & Seletor de Simulação */}
      <div className="bg-[#111] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              to={`/regiao/${id}`} 
              className="p-1.5 text-gray-400 hover:text-white hover:bg-[#222] rounded-lg transition-colors mr-1"
              title="Voltar ao Painel Geral"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15] border border-[#facc15]/20">
              <Award className="w-5 h-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#facc15] uppercase tracking-wider">Módulo 08</span>
                <span className="text-gray-600">•</span>
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  Gestão da Mesa Diretora
                </h1>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {conselho?.nome || 'Conselho Regional'} — Liderança executiva, titulares e vigência do mandato
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        
        {/* Banner Institucional do Mandato Ativo */}
        <div className="bg-gradient-to-r from-[#181818] via-[#141414] to-[#0f0f0f] border border-[#2e2e2e] rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full font-bold text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                MANDATO VIGENTE ATIVO
              </span>
              <span className="px-3 py-1 bg-[#222] text-[#facc15] border border-[#444] rounded-full font-semibold text-xs flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#facc15]" />
                Gestão: {presidente?.inicio_mandato?.split('-')[0] || '2026'} - {presidente?.termino_mandato?.split('-')[0] || '2027'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              Mesa Diretora do Conselho Regional
            </h2>
            <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
              Órgão executivo responsável pela representação, deliberações oficiais, coordenação das Lojas Jurisdicionadas e harmonia regional maçônica.
            </p>
          </div>

          {userContext.is_diretoria && (
            <button
              type="button"
              onClick={() => setShowDiretoriaModal(true)}
              className="inline-flex items-center gap-2 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] px-5 py-3 rounded-xl transition-all shadow-lg hover:shadow-[#facc15]/20 cursor-pointer shrink-0"
            >
              <Edit3 className="w-4 h-4" /> Gerenciar Mesa Diretora
            </button>
          )}
        </div>

        {/* Tríade Executiva: Presidente, Vice-Presidente e Secretário */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card: Presidente */}
          <div className="bg-[#141414] border border-[#2b2b2b] hover:border-[#facc15]/40 rounded-2xl p-6 shadow-xl transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/30">
                  Presidente
                </span>
                <Shield className="w-5 h-5 text-[#facc15] opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2a2612] to-[#16140b] border border-[#facc15]/40 text-[#facc15] flex items-center justify-center font-black text-xl shadow-inner shrink-0">
                  P
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate" title={presidente?.nome_completo || 'Pendente de Nomeação'}>
                    {presidente?.nome_completo || (presidente?.usuario_id ? `CIM: ${presidente.usuario_id}` : 'Aguardando Nomeação')}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                    {presidente?.usuario_id ? `CIM: ${presidente.usuario_id}` : 'Sem CIM registrado'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[#222] space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Contato Oficial:</span>
                  <span className="text-gray-200 truncate max-w-[160px] font-medium" title={presidente?.email}>
                    {presidente?.email || 'contato@corevm.org'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>Status do Titular:</span>
                  {presidente?.vinculo_desatualizado || presidente?.loja_sem_vm ? (
                    <span className="text-orange-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Assento a Atualizar
                    </span>
                  ) : (
                    <span className="text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Titular Ativo
                    </span>
                  )}
                </div>
              </div>

              {userContext.is_diretoria && renderAvisoOrfao(presidente, 'presidente')}
            </div>

            <div className="mt-6 pt-3 border-t border-[#222] text-[11px] text-gray-500">
              Presidência executiva, convocação de plenárias e representação institucional.
            </div>
          </div>

          {/* Card: Vice-Presidente */}
          <div className="bg-[#141414] border border-[#2b2b2b] hover:border-blue-500/40 rounded-2xl p-6 shadow-xl transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Vice-Presidente
                </span>
                <UserCheck className="w-5 h-5 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0e1e2d] to-[#09121a] border border-blue-500/40 text-blue-400 flex items-center justify-center font-black text-xl shadow-inner shrink-0">
                  V
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate" title={vicePresidente?.nome_completo || 'Pendente de Nomeação'}>
                    {vicePresidente?.nome_completo || (vicePresidente?.usuario_id ? `CIM: ${vicePresidente.usuario_id}` : 'Aguardando Nomeação')}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                    {vicePresidente?.usuario_id ? `CIM: ${vicePresidente.usuario_id}` : 'Sem CIM registrado'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[#222] space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Contato Oficial:</span>
                  <span className="text-gray-200 truncate max-w-[160px] font-medium" title={vicePresidente?.email}>
                    {vicePresidente?.email || 'contato@corevm.org'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>Status do Titular:</span>
                  {vicePresidente?.vinculo_desatualizado || vicePresidente?.loja_sem_vm ? (
                    <span className="text-orange-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Assento a Atualizar
                    </span>
                  ) : (
                    <span className="text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Titular Ativo
                    </span>
                  )}
                </div>
              </div>

              {userContext.is_diretoria && renderAvisoOrfao(vicePresidente, 'vice-presidente')}
            </div>

            <div className="mt-6 pt-3 border-t border-[#222] text-[11px] text-gray-500">
              Sucessão executiva regimental e articulação com as comissões técnicas.
            </div>
          </div>

          {/* Card: Secretário */}
          <div className="bg-[#141414] border border-[#2b2b2b] hover:border-purple-500/40 rounded-2xl p-6 shadow-xl transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  Secretário
                </span>
                <Award className="w-5 h-5 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#24112e] to-[#120817] border border-purple-500/40 text-purple-400 flex items-center justify-center font-black text-xl shadow-inner shrink-0">
                  S
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate" title={secretario?.nome_completo || 'Pendente de Nomeação'}>
                    {secretario?.nome_completo || (secretario?.usuario_id ? `CIM: ${secretario.usuario_id}` : 'Aguardando Nomeação')}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                    {secretario?.usuario_id ? `CIM: ${secretario.usuario_id}` : 'Sem CIM registrado'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[#222] space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span>Contato Oficial:</span>
                  <span className="text-gray-200 truncate max-w-[160px] font-medium" title={secretario?.email}>
                    {secretario?.email || 'contato@corevm.org'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>Status do Titular:</span>
                  {secretario?.vinculo_desatualizado || secretario?.loja_sem_vm ? (
                    <span className="text-orange-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Assento a Atualizar
                    </span>
                  ) : (
                    <span className="text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Titular Ativo
                    </span>
                  )}
                </div>
              </div>

              {userContext.is_diretoria && renderAvisoOrfao(secretario, 'secretario')}
            </div>

            <div className="mt-6 pt-3 border-t border-[#222] text-[11px] text-gray-500">
              Redação de atas, acervo documental, circulares e comunicações formais.
            </div>
          </div>

        </div>

        {/* Painel Informativo da Vigência */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#facc15]" />
            Cronograma do Mandato Oficial
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#0d0d0d] border border-[#222]">
              <span className="text-gray-500 block mb-1">Data Oficial de Posse / Início:</span>
              <span className="text-white font-bold text-base font-mono">
                {presidente?.inicio_mandato || secretario?.inicio_mandato || '2026-09-08'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#0d0d0d] border border-[#222]">
              <span className="text-gray-500 block mb-1">Data Prevista de Término / Transição:</span>
              <span className="text-white font-bold text-base font-mono">
                {presidente?.termino_mandato || secretario?.termino_mandato || '2027-09-08'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal: Gerenciar Mesa Diretora e Mandato */}
      {showDiretoriaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/30">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Gerenciar Mesa Diretora</h2>
                <p className="text-xs text-gray-400">Escolha os Veneráveis Mestres titulares e o período de vigência.</p>
              </div>
            </div>

            {/* CORREÇÃO (2026-09-14, bug reportado em teste): os 3 campos
                eram <input type="text"> de CIM livre, sem nenhuma validação
                ou prévia de quem seria designado — permitia inclusive um CIM
                inexistente. Agora são seletores populados só com os
                Veneráveis Mestres em exercício das Lojas jurisdicionadas
                (GET /veneraveis-elegiveis), com o nome do titular visível
                antes de salvar. O backend valida de novo (defesa em
                profundidade). */}
            <form onSubmit={handleSalvarDiretoria} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-1">
                  Presidente do Conselho
                </label>
                <select
                  value={diretoriaForm.presidente_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, presidente_id: e.target.value})}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none"
                >
                  <option value="">Selecione o Venerável Mestre...</option>
                  {veneraveisElegiveis.map((v) => (
                    <option key={v.usuario_id} value={v.usuario_id}>
                      {v.nome_completo || v.usuario_id} — Loja {v.loja_numero || v.loja_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                  Vice-Presidente
                </label>
                <select
                  value={diretoriaForm.vice_presidente_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, vice_presidente_id: e.target.value})}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Selecione o Venerável Mestre...</option>
                  {veneraveisElegiveis.map((v) => (
                    <option key={v.usuario_id} value={v.usuario_id}>
                      {v.nome_completo || v.usuario_id} — Loja {v.loja_numero || v.loja_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                  Secretário do Conselho
                </label>
                <select
                  value={diretoriaForm.secretario_id}
                  onChange={(e) => setDiretoriaForm({...diretoriaForm, secretario_id: e.target.value})}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-purple-400 focus:outline-none"
                >
                  <option value="">Selecione o Venerável Mestre...</option>
                  {veneraveisElegiveis.map((v) => (
                    <option key={v.usuario_id} value={v.usuario_id}>
                      {v.nome_completo || v.usuario_id} — Loja {v.loja_numero || v.loja_id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Início do Mandato</label>
                  <input 
                    type="date"
                    required
                    value={diretoriaForm.inicio_mandato}
                    onChange={(e) => setDiretoriaForm({...diretoriaForm, inicio_mandato: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Término do Mandato</label>
                  <input 
                    type="date"
                    required
                    value={diretoriaForm.termino_mandato}
                    onChange={(e) => setDiretoriaForm({...diretoriaForm, termino_mandato: e.target.value})}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#facc15]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                <button 
                  type="button" 
                  onClick={() => setShowDiretoriaModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={salvandoDiretoria}
                  className="bg-[#facc15] hover:bg-[#eab308] text-black px-5 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {salvandoDiretoria ? 'Gravando...' : 'Salvar Mandato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
