import React, { useState, useEffect } from 'react';
import { clienteHttp, API_URL } from '../../../compartilhado/contextos/AuthContext';
import { CampoData, CampoHora } from '../../../compartilhado/componentes/SeletorDataHora';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Building2, ShieldCheck, Loader2, Award,
  Edit3, Trash2, Plus, Search, CheckCircle2, AlertTriangle, ArrowLeft,
  Users, UserCog, X, Zap, MoreVertical, Phone, Mail,
  Globe, Info
} from 'lucide-react';
import BuscadorLoja from '../../../compartilhado/componentes/BuscadorLoja';
import ModalCadastroObreiro from '../../../compartilhado/componentes/ModalCadastroObreiro';
import ModalGestaoVM from '../../../compartilhado/componentes/ModalGestaoVM';
import PainelMinhaLoja from '../../../compartilhado/componentes/PainelMinhaLoja';

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

  // ALTERAÇÃO (2026-09-18, revisão a pedido do usuário -- a 1ª versão desta
  // feature só filtrava esta mesma tabela pra 1 linha, reaproveitando os
  // widgets do módulo inteiro ("Módulo 07", métricas de todas as Lojas da
  // Região), que não fazem sentido numa visão de UMA Loja só. Agora
  // "?minha=1" (vindo do item de menu "Minha Loja" em Layout.tsx) troca
  // TODA a tela por um painel dedicado (PainelMinhaLoja), com cartões
  // específicos da própria Loja/VM/Suplente -- não é mais um filtro desta
  // tabela.
  const [searchParams] = useSearchParams();
  const emModoPainel = searchParams.get('minha') === '1';

  // Modais
  const [gestaoVmModal, setGestaoVmModal] = useState<any>(null);
  const [addObreiroModal, setAddObreiroModal] = useState<any>(null);
  const [addSuplenteModal, setAddSuplenteModal] = useState<any>(null);
  const [showAddLojaModal, setShowAddLojaModal] = useState(false);
  const [editLojaModal, setEditLojaModal] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Modais para a nova experiência Mobile First e visualização limpa
  const [lojaDetalhesModal, setLojaDetalhesModal] = useState<any>(null);
  const [lojaAcoesModal, setLojaAcoesModal] = useState<any>(null);

  // ALTERAÇÃO (2026-09-12): "Designação Livre de Suplente" — o VM da própria
  // Loja (ou a Diretoria do Conselho, para qualquer Loja) escolhe livremente
  // qualquer um dos 6 oficiais eletivos da Loja (VM excluído, ver correção
  // 2026-09-14 em CARGOS_SUPLENTE_ELEGIVEIS) para ocupar a cadeira de
  // Suplente do Conselho. Usa as novas rotas GET /lojas/{id}/oficiais e
  // PUT|DELETE /lojas/{id}/suplente (backend, seção 9.13 do histórico).
  const [designarSuplenteModal, setDesignarSuplenteModal] = useState<any>(null);
  const [oficiaisLoja, setOficiaisLoja] = useState<any[]>([]);
  const [carregandoOficiais, setCarregandoOficiais] = useState(false);
  const [suplenteEscolhido, setSuplenteEscolhido] = useState('');
  const [salvandoSuplente, setSalvandoSuplente] = useState(false);

  // ALTERAÇÃO (2026-09-14): transmissão de cargo emergencial de VM — quando
  // uma Loja fica órfã (sem VM) e não regulariza pelo módulo Lojas. Ver
  // regional/rotas.py (conceder/executar) e
  // claude/decisao-transmissao-cargo-vm.md no Project.
  const [concedendoTransmissao, setConcedendoTransmissao] = useState<string | null>(null); // loja_id em andamento
  const [transmissaoModal, setTransmissaoModal] = useState<any>(null); // loja alvo, quando o form está aberto
  const [transmissaoForm, setTransmissaoForm] = useState({
    cim: '', nome_completo: '', email: '', cpf: '', telefone: '', data_inicio_mandato: new Date().toISOString().split('T')[0]
  });
  const [salvandoTransmissao, setSalvandoTransmissao] = useState(false);

  // Form Edição de Loja
  // ALTERAÇÃO (2026-09-19): campos adicionais a pedido do usuário — endereço
  // completo, dia/horário de sessão e contato institucional — além dos 4
  // campos originais (nome/número/rito/cidade). Ver LojaUpdatePayload em
  // api/v1/integracao/rotas_lojas.py (backend) e claude/roteiro-testes-
  // manuais.md no Project "Core" para o registro desta mudança.
  const [editLojaForm, setEditLojaForm] = useState({
    nome: '',
    numero: '',
    rito: '',
    cidade: '',
    logradouro: '',
    numero_endereco: '',
    complemento: '',
    bairro: '',
    estado: '',
    cep: '',
    dia_sessao: '',
    periodicidade: '',
    horario_sessao: '',
    email: '',
    telefone: '',
    site: '',
    cnpj: ''
  });
  const [salvandoLoja, setSalvandoLoja] = useState(false);

  // Formatação estrita e padronizada de exibição da Loja: 'Loja ' + {nome_loja} + ', nº ' + {numero_loja}
  const formatarTituloLoja = (loja: any) => {
    if (!loja) return 'Loja';
    const nomeBruto = (loja.nome_loja || loja.nome || '').replace(/^Loja\s+/i, '').trim();
    const numLoja = loja.numero_loja || loja.numero || '';
    const ehApenasId = !nomeBruto || /^\d+$/.test(nomeBruto) || nomeBruto.startsWith('#');

    if (numLoja && numLoja !== 'S/N' && String(numLoja).trim() !== '') {
      if (ehApenasId) {
        return `Loja nº ${numLoja}`;
      }
      return `Loja ${nomeBruto}, nº ${numLoja}`;
    }

    if (ehApenasId) {
      const idFallback = loja.loja_id || loja.id || nomeBruto;
      return `Loja #${idFallback}`;
    }

    return `Loja ${nomeBruto}`;
  };

  const abrirEdicaoLoja = (loja: any) => {
    setEditLojaModal(loja);
    setEditLojaForm({
      nome: loja.nome ? loja.nome.replace(/^Loja\s+/i, '') : '',
      numero: loja.numero || '',
      rito: loja.rito || 'REAA',
      cidade: loja.cidade || '',
      logradouro: loja.logradouro || '',
      numero_endereco: loja.numero_endereco || '',
      complemento: loja.complemento || '',
      bairro: loja.bairro || '',
      estado: loja.estado || '',
      cep: loja.cep || '',
      dia_sessao: loja.dia_sessao || '',
      periodicidade: loja.periodicidade || '',
      horario_sessao: loja.horario_sessao || '',
      email: loja.email || '',
      telefone: loja.telefone || '',
      site: loja.site || '',
      cnpj: loja.cnpj || ''
    });
  };

  const handleSalvarLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLojaModal) return;
    setSalvandoLoja(true);
    try {
      await clienteHttp.put(`${API_URL}/integracao/lojas/${editLojaModal.loja_id}`, editLojaForm);
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
    setErro('');
    try {
      const userRes = await clienteHttp.get(`${API_URL}/regional/${id}/me`);
      setUserContext(userRes.data);

      // Busca oficial das Lojas Jurisdicionadas pertencentes a este Conselho no CoReVM
      const resLojas = await clienteHttp.get(`${API_URL}/regional/${id}/lojas`);
      const lojasBase = resLojas.data?.lojas || [];

      // MODO PAINEL: "Minha Loja" (?minha=1)
      if (emModoPainel) {
        const minhaLojaId = userRes.data?.loja_id;
        const lojaBase = lojasBase.find((l: any) => 
          String(l.id) === String(minhaLojaId) || String(l.loja_id) === String(minhaLojaId)
        );
        if (!lojaBase) {
          setConselho({ lojas: [] });
          setLoading(false);
          return;
        }

        let nomeVmAtivo = lojaBase.veneravel_nome || null;
        let potenciaExtra = lojaBase.potencia || null;

        // Enriquecimento opcional protegido contra falhas externas
        const targetId = parseInt(lojaBase.id || lojaBase.loja_id);
        if (!isNaN(targetId)) {
          try {
            const [detailsRes, vmStatusRes] = await Promise.all([
              clienteHttp.post(`${API_URL}/integracao/lojas/busca/multiplas`, [targetId]).catch(() => null),
              clienteHttp.post(`${API_URL}/integracao/lojas/status_vm`, [targetId]).catch(() => null)
            ]);
            if (detailsRes?.data && Array.isArray(detailsRes.data) && detailsRes.data.length > 0) {
              potenciaExtra = detailsRes.data[0].potencia || potenciaExtra;
            }
            if (vmStatusRes?.data && typeof vmStatusRes.data === 'object') {
              nomeVmAtivo = vmStatusRes.data[targetId] || vmStatusRes.data[String(targetId)] || nomeVmAtivo;
            }
          } catch {
            // Degradação suave: CoReVM mantém exibição mesmo sem o módulo Lojas
          }
        }

        setConselho({
          lojas: [{
            ...lojaBase,
            id: targetId,
            loja_id: String(targetId),
            potencia: potenciaExtra,
            veneravel_nome: nomeVmAtivo,
            hasVm: Boolean(nomeVmAtivo || lojaBase.hasVm),
          }]
        });
        setLoading(false);
        return;
      }

      // MODO GERAL: Tabela de Lojas Jurisdicionadas do Conselho Regional
      // Consulta estritamente pelos identificadores únicos (id ou codigo_loja)
      const idsConsulta = Array.from(new Set(
        lojasBase
          .map((l: any) => l.loja_id || l.id)
          .filter(Boolean)
      ));

      let detailsMap: Record<string, any> = {};
      let vmStatusMap: Record<string, any> = {};

      if (idsConsulta.length > 0) {
        try {
          const [detailsRes, vmStatusRes] = await Promise.all([
            clienteHttp.post(`${API_URL}/integracao/lojas/busca/multiplas`, idsConsulta).catch(() => null),
            clienteHttp.post(`${API_URL}/integracao/lojas/status_vm`, idsConsulta).catch(() => null)
          ]);

          if (detailsRes?.data && Array.isArray(detailsRes.data)) {
            detailsRes.data.forEach((d: any) => {
              if (d.id != null) detailsMap[String(d.id)] = d;
              if (d.codigo_loja) detailsMap[String(d.codigo_loja)] = d;
            });
          }
          if (vmStatusRes?.data && typeof vmStatusRes.data === 'object') {
            vmStatusMap = vmStatusRes.data;
          }
        } catch {
          // Degradação suave: se a integração externa falhar, CoReVM exibe os dados locais sem travar a tela
        }
      }

      const lojasProcessadas = lojasBase.map((l: any) => {
        const lojaIdStr = String(l.loja_id || l.id);
        const det = detailsMap[lojaIdStr] || null;
        const nomeVmAtivo = vmStatusMap[lojaIdStr] 
          || (det && vmStatusMap[String(det.id)]) 
          || (det?.codigo_loja && vmStatusMap[det.codigo_loja])
          || l.veneravel_nome 
          || null;

        // Limpa o nome da loja removendo prefixo redundante "Loja" se houver
        const nomeBruto = det?.nome_loja || det?.nome || l.nome_loja || l.nome || '';
        const nomeLimpo = nomeBruto.replace(/^Loja\s+/i, '').trim() || `Loja #${lojaIdStr}`;
        const numeroFinal = det?.numero_loja || det?.numero || l.numero_loja || l.numero || '';

        return {
          ...l,
          id: l.id || lojaIdStr,
          loja_id: lojaIdStr,
          codigo_loja: det?.codigo_loja || l.codigo_loja || null,
          nome: nomeLimpo,
          nome_loja: nomeLimpo,
          numero: String(numeroFinal),
          numero_loja: String(numeroFinal),
          cidade: det?.cidade || l.cidade || '',
          estado: det?.estado || l.estado || '',
          potencia: det?.potencia || l.potencia || '',
          rito: det?.rito || l.rito || '',
          logradouro: det?.logradouro || l.logradouro || '',
          numero_endereco: det?.numero_endereco || l.numero_endereco || '',
          complemento: det?.complemento || l.complemento || '',
          bairro: det?.bairro || l.bairro || '',
          cep: det?.cep || l.cep || '',
          dia_sessao: det?.dia_sessao || l.dia_sessao || '',
          periodicidade: det?.periodicidade || l.periodicidade || '',
          horario_sessao: det?.horario_sessao || l.horario_sessao || '',
          email: det?.email || l.email || '',
          telefone: det?.telefone || l.telefone || '',
          site: det?.site || l.site || '',
          cnpj: det?.cnpj || l.cnpj || '',
          veneravel_nome: nomeVmAtivo,
          hasVm: Boolean(nomeVmAtivo || l.hasVm),
          suplente_nome: l.suplente_nome || null,
          suplente_usuario_id: l.suplente_usuario_id || null,
          suplente_pode_indicar_veneravel: Boolean(l.suplente_pode_indicar_veneravel)
        };
      });

      // Ordena por Potência e depois por Número da Loja
      lojasProcessadas.sort((a: any, b: any) => {
        const potA = a.potencia || '';
        const potB = b.potencia || '';
        if (potA !== potB) return potA.localeCompare(potB);
        return (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0);
      });

      setConselho({ lojas: lojasProcessadas });
    } catch (err: any) {
      setErro(extrairMensagemErro(err, "Erro ao carregar dados das lojas jurisdicionadas."));
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

  // ALTERAÇÃO (2026-09-14): passo 1 da transmissão de cargo emergencial —
  // Diretoria concede ao último VM da Loja ("Mestre Instalado imediato",
  // identificado automaticamente pelo backend) o poder de uso único de
  // indicar o próximo VM. Só se aplica a Lojas órfãs (sem VM em exercício).
  const concederTransmissaoEmergencial = async (loja: any) => {
    if (!confirm(
      `Conceder ao último Venerável Mestre desta Loja (identificado automaticamente pelo sistema) o poder de indicar, ` +
      `em caráter excepcional e de uso único, o próximo Venerável Mestre?`
    )) return;
    setConcedendoTransmissao(loja.loja_id);
    try {
      const res = await clienteHttp.post(`${API_URL}/regional/${id}/lojas/${loja.loja_id}/transmissao-emergencial/conceder`);
      alert(res.data?.message || 'Poder concedido com sucesso.');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao conceder o poder de transmissão emergencial'));
    } finally {
      setConcedendoTransmissao(null);
    }
  };

  // Passo 2 (execução): abre o formulário de indicação do novo VM — usado
  // tanto pela Diretoria (a qualquer momento, para uma Loja órfã) quanto
  // pelo próprio Suplente-regente (Mestre Instalado imediato), enquanto o
  // poder de uso único ainda não tiver sido exercido.
  const abrirTransmissaoEmergencial = (loja: any) => {
    setTransmissaoModal(loja);
    setTransmissaoForm({
      cim: '', nome_completo: '', email: '', cpf: '', telefone: '',
      data_inicio_mandato: new Date().toISOString().split('T')[0]
    });
  };

  const handleExecutarTransmissaoEmergencial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transmissaoModal) return;
    setSalvandoTransmissao(true);
    try {
      const res = await clienteHttp.post(
        `${API_URL}/regional/${id}/lojas/${transmissaoModal.loja_id}/transmissao-emergencial/executar`,
        transmissaoForm
      );
      alert(res.data?.message || 'Transmissão de cargo concluída com sucesso.');
      setTransmissaoModal(null);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(extrairMensagemErro(e, 'Erro ao executar a transmissão de cargo emergencial'));
    } finally {
      setSalvandoTransmissao(false);
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

  // ALTERAÇÃO (2026-09-18): objeto da própria Loja do VM logado, usado só
  // pelo painel dedicado "Minha Loja" (emModoPainel) -- ver PainelMinhaLoja.
  const minhaLoja = userContext.loja_id
    ? (conselho?.lojas || []).find((l: any) => String(l.loja_id) === String(userContext.loja_id))
    : null;

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

      {/* ALTERAÇÃO (2026-09-18, revisão a pedido do usuário): "Minha Loja"
          agora troca a tela inteira por um painel dedicado -- os widgets do
          módulo inteiro (sub-header "Módulo 07", métricas de todas as
          Lojas, tabela) só fazem sentido na visão de todas as Lojas. */}
      {emModoPainel ? (
        <PainelMinhaLoja
          loja={minhaLoja}
          regiaoId={id}
          userContext={userContext}
          onAbrirGestaoVM={() => minhaLoja && setGestaoVmModal(minhaLoja)}
          onAbrirEdicaoLoja={() => minhaLoja && abrirEdicaoLoja(minhaLoja)}
          onAbrirDesignarSuplente={() => minhaLoja && abrirDesignarSuplente(minhaLoja)}
          onAbrirTransmissaoEmergencial={() => minhaLoja && abrirTransmissaoEmergencial(minhaLoja)}
        />
      ) : (
      <>
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
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  Lojas Jurisdicionadas
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
        
        {/* Painel de Métricas Rápidas — Versão Mobile (Micro-KPIs em linha única compacta) */}
        <div className="grid grid-cols-3 gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setFiltroStatus('TODAS')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              filtroStatus === 'TODAS'
                ? 'bg-[#facc15]/10 border-[#facc15] ring-1 ring-[#facc15]/30'
                : 'bg-[#141414] border-[#262626] text-gray-400'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider truncate">Lojas</span>
            <div className="text-lg font-black text-white">{totalLojas}</div>
            <span className="text-[9px] text-gray-500 block truncate">Total no Conselho</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStatus(filtroStatus === 'COM_VM' ? 'TODAS' : 'COM_VM')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              filtroStatus === 'COM_VM'
                ? 'bg-green-500/15 border-green-500 ring-1 ring-green-500/30'
                : 'bg-[#141414] border-[#262626] text-gray-400'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-green-400 block tracking-wider truncate">Com VM</span>
            <div className="text-lg font-black text-green-400">{lojasComVm}</div>
            <span className="text-[9px] text-green-500/70 block truncate">Empossados</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroStatus(filtroStatus === 'PENDENTES' ? 'TODAS' : 'PENDENTES')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              filtroStatus === 'PENDENTES'
                ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/30'
                : 'bg-[#141414] border-[#262626] text-gray-400'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider truncate">Pendentes</span>
            <div className="text-lg font-black text-amber-400">{lojasPendentes}</div>
            <span className="text-[9px] text-amber-500/70 block truncate">A regularizar</span>
          </button>
        </div>

        {/* Painel de Métricas Rápidas — Versão Desktop (Cards amplos) */}
        <div className="hidden md:grid md:grid-cols-3 gap-4">
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
          
          {/* Barra de Filtros e Busca
              ALTERAÇÃO (2026-09-29): em mobile a busca ocupa linha própria (w-full)
              e os botões de filtro ficam ocultos (md:flex) — os cards de KPI no topo
              já permitem filtrar por Todas/Com VM/Pendentes com o mesmo efeito,
              tornando os botões redundantes e espremidos em telas pequenas. */}
          <div className="p-4 sm:p-5 border-b border-[#262626]">

            {/* Linha única em mobile: busca full-width + botão + */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar loja, número, rito, oriente ou VM..."
                  className="w-full bg-[#0d0d0d] border border-[#333] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-[#facc15] focus:outline-none transition-colors"
                />
              </div>

              {/* Botão + visível em mobile (ao lado da busca) */}
              {userContext.is_diretoria && (
                <button
                  type="button"
                  onClick={() => setShowAddLojaModal(true)}
                  className="md:hidden inline-flex items-center justify-center text-black bg-[#facc15] hover:bg-[#eab308] p-2.5 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
                  title="Vincular Nova Loja"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Segunda linha: botões de filtro (apenas desktop) + botão + desktop */}
            <div className="hidden md:flex items-center justify-between gap-3 mt-3">
              {/* Seletor de Filtro de Status — redundante em mobile, visível só em desktop */}
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

              {/* Botão + versão desktop */}
              {userContext.is_diretoria && (
                <button
                  type="button"
                  onClick={() => setShowAddLojaModal(true)}
                  className="inline-flex items-center justify-center text-black bg-[#facc15] hover:bg-[#eab308] p-2.5 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
                  title="Vincular Nova Loja"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Visualização Mobile: Cards Touch-Friendly Limpos (md:hidden) */}
          <div className="md:hidden divide-y divide-[#202020]">
            {lojasFiltradas.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs px-4">
                Nenhuma loja encontrada para o filtro informado.
              </div>
            ) : (
              lojasFiltradas.map((l: any) => {
                const ehMinhaLoja = Boolean(
                  userContext.loja_id && (String(l.loja_id) === String(userContext.loja_id) || String(l.id) === String(userContext.loja_id))
                );
                const ehMeuSuplente = Boolean(
                  userContext.usuario_id && l.suplente_usuario_id && String(userContext.usuario_id) === String(l.suplente_usuario_id)
                );


                // Composição Estrita: 'Loja ' + {nome_loja} + ', nº ' + {numero_loja}
                const tituloCard = formatarTituloLoja(l);

                return (
                  <div
                    key={l.loja_id}
                    onClick={() => setLojaDetalhesModal(l)}
                    className={`p-4 transition-all active:bg-[#1c1c1c] hover:bg-[#181818] cursor-pointer flex items-center justify-between gap-3 ${
                      ehMinhaLoja ? 'bg-blue-500/[0.04] border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    {/* Título Limpo Touch-Friendly */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-white text-sm tracking-tight leading-snug">
                          {tituloCard}
                        </h3>
                        {ehMinhaLoja && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            Sua Loja
                          </span>
                        )}
                        {ehMeuSuplente && !ehMinhaLoja && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Seu Assento
                          </span>
                        )}
                      </div>
                      {l.cidade && (
                        <span className="text-[11px] text-gray-500 block mt-0.5 truncate">
                          {l.cidade}
                        </span>
                      )}
                    </div>

                    {/* Botão Discreto de 3 Pontos para Ações de Configuração */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLojaAcoesModal(l);
                      }}
                      className="p-2 -mr-1 text-gray-400 hover:text-white hover:bg-[#252525] rounded-xl transition-colors cursor-pointer shrink-0"
                      title="Ações da Loja"
                      aria-label="Abrir opções de configuração"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Tabela de Lojas — Versão Desktop (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#262626] text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-[#101010]">
                  <th className="p-3.5 pl-5">Loja</th>
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
                    const ehMinhaLoja = Boolean(
                      userContext.loja_id && (String(l.loja_id) === String(userContext.loja_id) || String(l.id) === String(userContext.loja_id))
                    );
                    const ehMeuSuplente = Boolean(
                      userContext.usuario_id && l.suplente_usuario_id && String(userContext.usuario_id) === String(l.suplente_usuario_id)
                    );
                    const temVinculo = ehMinhaLoja || ehMeuSuplente;
                    const podeEditar = Boolean(userContext.is_diretoria || temVinculo);
                    const temVm = !!l.hasVm;
                    // ALTERAÇÃO (2026-09-14): transmissão de cargo emergencial
                    // — o Suplente-regente (Mestre Instalado imediato) precisa
                    // agir mesmo sem ser Diretoria nem VM desta Loja (ele é,
                    // por definição, o titular ANTERIOR — já não tem mais
                    // vínculo ativo). Ver regional/rotas.py.
                    const ehSuplenteRegente = !!userContext.usuario_id
                      && l.suplente_usuario_id === userContext.usuario_id
                      && l.suplente_pode_indicar_veneravel
                      && !temVm;

                    return (
                      <tr 
                        key={l.loja_id} 
                        onClick={() => setLojaDetalhesModal(l)}
                        className={`hover:bg-[#181818] transition-colors cursor-pointer group ${ehMinhaLoja ? 'bg-blue-500/[0.04]' : ''}`}
                      >
                        {/* Coluna unificada com padrão estrito: 'Loja {nome_loja}, nº {numero_loja}' */}
                        <td className="p-3.5 pl-5">
                          <span className="font-bold text-white group-hover:text-[#facc15] transition-colors">
                            {formatarTituloLoja(l)}
                          </span>
                          {ehMinhaLoja && (
                            <span
                              className="ml-2 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-blue-500/15 text-blue-300 border border-blue-500/30"
                              title="Esta é a sua Loja de vínculo ativo"
                            >
                              Sua Loja
                            </span>
                          )}
                          {ehMeuSuplente && !ehMinhaLoja && (
                            <span
                              className="ml-2 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              title="Você é o Suplente do Conselho desta Loja"
                            >
                              Seu Assento
                            </span>
                          )}
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

                        {/* ALTERAÇÃO (2026-09-14, redesenho pós-teste): a coluna
                            antes mostrava uma "tag" clicável cujo nome nunca
                            aparecia (bug de dado, corrigido acima) e que
                            duplicava a ação do botão "Gerenciar VM" da coluna
                            Ações — dois pontos de entrada para o mesmo modal.
                            Agora a célula só exibe o nome (texto), e a edição
                            fica concentrada nos ícones de Ações da linha. */}
                        <td className="p-3.5">
                          {temVm ? (
                            <div className="flex items-center gap-1.5 text-green-400 font-semibold" title="Venerável Mestre empossado">
                              <Award className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{l.veneravel_nome}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-400/90 font-medium" title="Mandato pendente de posse">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Pendente</span>
                            </div>
                          )}
                        </td>

                        <td className="p-3.5">
                          {l.suplente_nome ? (
                            <div className="flex items-center gap-1.5 text-blue-400 font-medium" title="Suplente do Conselho designado">
                              <Users className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{l.suplente_nome}</span>
                              {l.suplente_pode_indicar_veneravel && !temVm && (
                                <span
                                  className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-orange-500/15 text-orange-300 border border-orange-500/30"
                                  title="Mestre Instalado imediato — pode indicar o próximo VM (poder de uso único)"
                                >
                                  Mestre Instalado
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-600 text-[11px] italic">Não designado</span>
                          )}
                        </td>

                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {podeEditar ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setGestaoVmModal(l)}
                                  className="p-1.5 text-[#facc15] hover:text-black hover:bg-[#facc15] rounded-lg transition-colors cursor-pointer"
                                  title={temVm ? "Gerenciar Venerável Mestre" : "Empossar Venerável Mestre"}
                                >
                                  <Award className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => abrirDesignarSuplente(l)}
                                  className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/80 rounded-lg transition-colors cursor-pointer"
                                  title={l.suplente_nome ? "Trocar Suplente do Conselho" : "Designar Suplente do Conselho"}
                                >
                                  <UserCog className="w-4 h-4" />
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
                                {/* ALTERAÇÃO (2026-09-14): transmissão de cargo
                                    emergencial — só a Diretoria concede o poder
                                    ao Mestre Instalado imediato, e só para
                                    Lojas órfãs (sem VM) que ainda não têm o
                                    poder concedido. */}
                                {userContext.is_diretoria && !temVm && !l.suplente_pode_indicar_veneravel && (
                                  <button
                                    type="button"
                                    disabled={concedendoTransmissao === l.loja_id}
                                    onClick={() => concederTransmissaoEmergencial(l)}
                                    className="p-1.5 text-orange-400 hover:text-black hover:bg-orange-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                    title="Conceder ao Mestre Instalado imediato o poder de indicar o novo VM (transmissão emergencial)"
                                  >
                                    <Zap className="w-4 h-4" />
                                  </button>
                                )}
                                {userContext.is_diretoria && !temVm && (
                                  <button
                                    type="button"
                                    onClick={() => abrirTransmissaoEmergencial(l)}
                                    className="p-1.5 text-orange-400 hover:text-black hover:bg-orange-400 rounded-lg transition-colors cursor-pointer"
                                    title="Cadastrar novo Venerável Mestre emergencialmente (Diretoria)"
                                  >
                                    <Award className="w-4 h-4 opacity-60" />
                                  </button>
                                )}
                              </>
                            ) : ehSuplenteRegente ? (
                              <button
                                type="button"
                                onClick={() => abrirTransmissaoEmergencial(l)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-black bg-orange-400 hover:bg-orange-300 rounded-lg transition-colors cursor-pointer"
                                title="Indicar o próximo Venerável Mestre desta Loja (poder de uso único)"
                              >
                                <Zap className="w-3.5 h-3.5" /> Indicar novo VM
                              </button>
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
      </>
      )}

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
          {/* ALTERAÇÃO (2026-09-19): max-w-xl (era max-w-lg) e max-h-[85vh]
              com overflow interno — o formulário ganhou seções de endereço,
              sessão e contato institucional e não cabe mais numa tela sem
              rolagem própria do card. */}
          <div className="bg-[#111] border border-[#333] rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/30">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Editar Cadastro da Loja</h2>
                <p className="text-xs text-gray-400">Atualize informações oficiais, endereço, dia de sessão e contato.</p>
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

              {/* ALTERAÇÃO (2026-09-19): seções de Endereço, Dia/Horário de
                  Sessão e Contato Institucional — a pedido do usuário
                  ("outros itens poderiam ser incluídos para edição, como
                  dias de sessão, endereço, entre outros"). Ver
                  claude/roteiro-testes-manuais.md no Project "Core". */}
              <div className="pt-2 border-t border-[#222]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Endereço</p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Logradouro
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.logradouro}
                      onChange={(e) => setEditLojaForm({...editLojaForm, logradouro: e.target.value})}
                      placeholder="Rua, Avenida..."
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Nº
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.numero_endereco}
                      onChange={(e) => setEditLojaForm({...editLojaForm, numero_endereco: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.complemento}
                      onChange={(e) => setEditLojaForm({...editLojaForm, complemento: e.target.value})}
                      placeholder="Sala, andar..."
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.bairro}
                      onChange={(e) => setEditLojaForm({...editLojaForm, bairro: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      CEP
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.cep}
                      onChange={(e) => setEditLojaForm({...editLojaForm, cep: e.target.value})}
                      placeholder="00000-000"
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      UF
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={editLojaForm.estado}
                      onChange={(e) => setEditLojaForm({...editLojaForm, estado: e.target.value.toUpperCase()})}
                      placeholder="SP"
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white uppercase focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#222]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dia e Horário de Sessão</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Dia da Semana
                    </label>
                    <select
                      value={editLojaForm.dia_sessao}
                      onChange={(e) => setEditLojaForm({...editLojaForm, dia_sessao: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">—</option>
                      <option value="Domingos">Domingos</option>
                      <option value="Segundas-feiras">Segundas-feiras</option>
                      <option value="Terças-feiras">Terças-feiras</option>
                      <option value="Quartas-feiras">Quartas-feiras</option>
                      <option value="Quintas-feiras">Quintas-feiras</option>
                      <option value="Sextas-feiras">Sextas-feiras</option>
                      <option value="Sábados">Sábados</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Periodicidade
                    </label>
                    <select
                      value={editLojaForm.periodicidade}
                      onChange={(e) => setEditLojaForm({...editLojaForm, periodicidade: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    >
                      <option value="">—</option>
                      <option value="Semanal">Semanal</option>
                      <option value="Quinzenal">Quinzenal</option>
                      <option value="Mensal">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Horário
                    </label>
                    <CampoHora
                      value={editLojaForm.horario_sessao}
                      onChange={(v) => setEditLojaForm({...editLojaForm, horario_sessao: v})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#222]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contato Institucional</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={editLojaForm.email}
                      onChange={(e) => setEditLojaForm({...editLojaForm, email: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Telefone
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.telefone}
                      onChange={(e) => setEditLojaForm({...editLojaForm, telefone: e.target.value})}
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Site
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.site}
                      onChange={(e) => setEditLojaForm({...editLojaForm, site: e.target.value})}
                      placeholder="https://..."
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      CNPJ
                    </label>
                    <input
                      type="text"
                      value={editLojaForm.cnpj}
                      onChange={(e) => setEditLojaForm({...editLojaForm, cnpj: e.target.value})}
                      placeholder="00.000.000/0000-00"
                      className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
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
                    {formatarTituloLoja(designarSuplenteModal)} — escolha qualquer um dos 6 oficiais eletivos da loja (o Venerável Mestre não pode ser Suplente de si mesmo).
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

      {/* ALTERAÇÃO (2026-09-14): transmissão de cargo emergencial — formulário
          de indicação do novo VM, usado tanto pela Diretoria quanto pelo
          Mestre Instalado imediato (Suplente-regente com poder de uso único).
          Ver regional/rotas.py e claude/decisao-transmissao-cargo-vm.md no
          Project. */}
      {transmissaoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-orange-500/30 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-500/10 rounded-xl text-orange-400 border border-orange-500/30">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Transmissão de Cargo Emergencial</h2>
                  <p className="text-xs text-gray-400">
                    {formatarTituloLoja(transmissaoModal)} — indique o novo Venerável Mestre. Esta Loja está sem VM em exercício no sistema.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransmissaoModal(null)}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-[#222] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Esta ação encerra o mandato de VM anterior (se ainda constar como ativo por engano), marca o titular
                anterior como "Mestre Instalado" e abre um novo mandato para o Irmão indicado abaixo — direto no
                cadastro da Loja (módulo Lojas).
              </span>
            </div>

            <form onSubmit={handleExecutarTransmissaoEmergencial} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">CIM *</label>
                  <input
                    type="text"
                    required
                    value={transmissaoForm.cim}
                    onChange={(e) => setTransmissaoForm({ ...transmissaoForm, cim: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Início do Mandato</label>
                  <CampoData
                    value={transmissaoForm.data_inicio_mandato}
                    onChange={(v) => setTransmissaoForm({ ...transmissaoForm, data_inicio_mandato: v })}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={transmissaoForm.nome_completo}
                  onChange={(e) => setTransmissaoForm({ ...transmissaoForm, nome_completo: e.target.value })}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={transmissaoForm.email}
                    onChange={(e) => setTransmissaoForm({ ...transmissaoForm, email: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={transmissaoForm.telefone}
                    onChange={(e) => setTransmissaoForm({ ...transmissaoForm, telefone: e.target.value })}
                    className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">CPF</label>
                <input
                  type="text"
                  value={transmissaoForm.cpf}
                  onChange={(e) => setTransmissaoForm({ ...transmissaoForm, cpf: e.target.value })}
                  className="w-full bg-[#080808] border border-[#333] rounded-xl p-2 text-xs text-white focus:outline-none focus:border-orange-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#222]">
                <button
                  type="button"
                  onClick={() => setTransmissaoModal(null)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoTransmissao}
                  className="bg-orange-500 hover:bg-orange-400 text-black px-5 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {salvandoTransmissao ? 'Gravando...' : 'Confirmar Transmissão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES COMPLETOS DA LOJA (Ao tocar no card da loja) */}
      {lojaDetalhesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header do Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-[#222]">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-[#202020] text-[#facc15] font-bold text-xs border border-[#333]">
                    {lojaDetalhesModal.potencia || 'GOB'}
                  </span>
                  <span className="text-xs font-semibold text-gray-400">
                    {lojaDetalhesModal.rito || 'REAA'}
                  </span>
                  {userContext.loja_id && (String(lojaDetalhesModal.loja_id) === String(userContext.loja_id) || String(lojaDetalhesModal.id) === String(userContext.loja_id)) && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      Sua Loja
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                  {formatarTituloLoja(lojaDetalhesModal)}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lojaDetalhesModal.cidade || 'Oriente Não Informado'} {lojaDetalhesModal.estado ? `— ${lojaDetalhesModal.estado}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLojaDetalhesModal(null)}
                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-[#202020] transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo do Modal com Blocos de Informação */}
            <div className="space-y-5 text-xs">
              
              {/* Bloco 1: Liderança no Conselho Regional */}
              <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#facc15] block">
                  Liderança e Representação no Conselho
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#111] p-3 rounded-lg border border-[#222]">
                    <span className="text-gray-500 block mb-1">Venerável Mestre</span>
                    {lojaDetalhesModal.hasVm ? (
                      <div className="flex items-center gap-1.5 text-green-400 font-bold">
                        <Award className="w-4 h-4 shrink-0 text-green-400" />
                        <span className="truncate">{lojaDetalhesModal.veneravel_nome}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>Pendente de Posse / Regularização</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-[#111] p-3 rounded-lg border border-[#222]">
                    <span className="text-gray-500 block mb-1">Suplente do Conselho</span>
                    {lojaDetalhesModal.suplente_nome ? (
                      <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                        <Users className="w-4 h-4 shrink-0 text-blue-400" />
                        <span className="truncate">{lojaDetalhesModal.suplente_nome}</span>
                      </div>
                    ) : (
                      <span className="text-gray-500 italic">Nenhum oficial designado</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bloco 2: Templo e Sessões */}
              <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300 block">
                  Templo e Calendário de Trabalhos
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500 block mb-0.5">Endereço do Templo</span>
                    <p className="text-white font-medium">
                      {lojaDetalhesModal.logradouro ? (
                        <>
                          {lojaDetalhesModal.logradouro}, {lojaDetalhesModal.numero_endereco || 's/n'}
                          {lojaDetalhesModal.complemento ? ` - ${lojaDetalhesModal.complemento}` : ''}
                          <br />
                          {lojaDetalhesModal.bairro ? `${lojaDetalhesModal.bairro}, ` : ''}
                          {lojaDetalhesModal.cidade || ''} - {lojaDetalhesModal.estado || ''}
                          {lojaDetalhesModal.cep ? ` | CEP ${lojaDetalhesModal.cep}` : ''}
                        </>
                      ) : (
                        <span className="text-gray-500 italic">Endereço ainda não informado</span>
                      )}
                    </p>
                  </div>

                  <div>
                    <span className="text-gray-500 block mb-0.5">Dia e Horário das Sessões</span>
                    <p className="text-white font-medium">
                      {lojaDetalhesModal.dia_sessao ? (
                        <>
                          {lojaDetalhesModal.dia_sessao}
                          {lojaDetalhesModal.horario_sessao ? ` às ${lojaDetalhesModal.horario_sessao}` : ''}
                          {lojaDetalhesModal.periodicidade ? ` (${lojaDetalhesModal.periodicidade})` : ''}
                        </>
                      ) : (
                        <span className="text-gray-500 italic">Horário não cadastrado</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bloco 3: Contatos Institucionais */}
              <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300 block">
                  Contatos e Comunicação Institucional
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block mb-0.5">E-mail</span>
                    {lojaDetalhesModal.email ? (
                      <a href={`mailto:${lojaDetalhesModal.email}`} className="text-[#facc15] hover:underline flex items-center gap-1 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{lojaDetalhesModal.email}</span>
                      </a>
                    ) : (
                      <span className="text-gray-500 italic">Não informado</span>
                    )}
                  </div>

                  <div>
                    <span className="text-gray-500 block mb-0.5">Telefone / WhatsApp</span>
                    {lojaDetalhesModal.telefone ? (
                      <a href={`tel:${lojaDetalhesModal.telefone}`} className="text-white hover:text-[#facc15] flex items-center gap-1 truncate">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{lojaDetalhesModal.telefone}</span>
                      </a>
                    ) : (
                      <span className="text-gray-500 italic">Não informado</span>
                    )}
                  </div>

                  <div>
                    <span className="text-gray-500 block mb-0.5">Website</span>
                    {lojaDetalhesModal.site ? (
                      <a href={lojaDetalhesModal.site} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1 truncate">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{lojaDetalhesModal.site}</span>
                      </a>
                    ) : (
                      <span className="text-gray-500 italic">Não informado</span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Rodapé do Modal com Ações Rápidas */}
            <div className="flex items-center justify-between pt-4 border-t border-[#222] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {(userContext.is_diretoria || (userContext.loja_id && String(lojaDetalhesModal.loja_id) === String(userContext.loja_id))) && (
                  <button
                    type="button"
                    onClick={() => {
                      const l = lojaDetalhesModal;
                      setLojaDetalhesModal(null);
                      abrirEdicaoLoja(l);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#222] text-white hover:bg-[#333] transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar Cadastro
                  </button>
                )}
                {(userContext.is_diretoria || (userContext.loja_id && String(lojaDetalhesModal.loja_id) === String(userContext.loja_id))) && (
                  <button
                    type="button"
                    onClick={() => {
                      const l = lojaDetalhesModal;
                      setLojaDetalhesModal(null);
                      setGestaoVmModal(l);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#facc15]/15 text-[#facc15] hover:bg-[#facc15]/25 border border-[#facc15]/30 transition-colors"
                  >
                    <Award className="w-3.5 h-3.5" /> Gerenciar VM
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setLojaDetalhesModal(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-300 hover:text-white bg-[#1a1a1a] hover:bg-[#252525] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AÇÕES DE CONFIGURAÇÃO (3 Pontos no Mobile) */}
      {lojaAcoesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#141414] border border-[#2a2a2a] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Header da Ação */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Opções de Configuração</span>
                <h3 className="font-bold text-white text-base truncate">
                  {formatarTituloLoja(lojaAcoesModal)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLojaAcoesModal(null)}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#202020]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Botões de Ação */}
            <div className="space-y-1.5 text-xs">
              {/* Ver Detalhes */}
              <button
                type="button"
                onClick={() => {
                  const l = lojaAcoesModal;
                  setLojaAcoesModal(null);
                  setLojaDetalhesModal(l);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-semibold text-white">Visualizar Informações Completas</div>
                  <div className="text-[11px] text-gray-400">Ver endereço, reuniões, contatos e diretoria</div>
                </div>
              </button>

              {/* Gerenciar / Empossar VM */}
              {(userContext.is_diretoria || (userContext.loja_id && String(lojaAcoesModal.loja_id) === String(userContext.loja_id))) && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    setGestaoVmModal(l);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
                >
                  <Award className="w-4 h-4 text-[#facc15] shrink-0" />
                  <div>
                    <div className="font-semibold text-white">
                      {lojaAcoesModal.hasVm ? 'Gerenciar Venerável Mestre' : 'Empossar Venerável Mestre'}
                    </div>
                    <div className="text-[11px] text-gray-400">Atualizar mandato ou realizar transmissão de posse</div>
                  </div>
                </button>
              )}

              {/* Designar Suplente */}
              {(userContext.is_diretoria || (userContext.loja_id && String(lojaAcoesModal.loja_id) === String(userContext.loja_id))) && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    abrirDesignarSuplente(l);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
                >
                  <UserCog className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">
                      {lojaAcoesModal.suplente_nome ? 'Trocar Suplente do Conselho' : 'Designar Suplente do Conselho'}
                    </div>
                    <div className="text-[11px] text-gray-400">Indicar oficial eletivo da oficina para a cadeira regional</div>
                  </div>
                </button>
              )}

              {/* Editar Dados Cadastrais */}
              {(userContext.is_diretoria || (userContext.loja_id && String(lojaAcoesModal.loja_id) === String(userContext.loja_id))) && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    abrirEdicaoLoja(l);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Editar Dados Cadastrais da Loja</div>
                    <div className="text-[11px] text-gray-400">Endereço, dia/horário de sessões e contatos</div>
                  </div>
                </button>
              )}

              {/* Transmissão Emergencial de Cargo (Diretoria) */}
              {userContext.is_diretoria && !lojaAcoesModal.hasVm && !lojaAcoesModal.suplente_pode_indicar_veneravel && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    concederTransmissaoEmergencial(l);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-orange-400">Conceder Transmissão Emergencial</div>
                    <div className="text-[11px] text-gray-400">Autorizar Mestre Instalado a indicar novo VM</div>
                  </div>
                </button>
              )}

              {userContext.is_diretoria && !lojaAcoesModal.hasVm && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    abrirTransmissaoEmergencial(l);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] text-white text-left font-medium transition-colors cursor-pointer"
                >
                  <Award className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-orange-400">Cadastrar VM Emergencial (Diretoria)</div>
                    <div className="text-[11px] text-gray-400">Inserir novo Venerável Mestre diretamente pelo Conselho</div>
                  </div>
                </button>
              )}

              {/* Desvincular Loja do Conselho (Diretoria) */}
              {userContext.is_diretoria && (
                <button
                  type="button"
                  onClick={() => {
                    const l = lojaAcoesModal;
                    setLojaAcoesModal(null);
                    removerLoja(l.loja_id);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-left font-medium transition-colors cursor-pointer border border-red-500/20"
                >
                  <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-red-400">Desvincular Loja do Conselho</div>
                    <div className="text-[11px] text-red-400/80">Remover esta loja da jurisdição regional</div>
                  </div>
                </button>
              )}
            </div>

            {/* Botão Cancelar */}
            <div className="pt-2 border-t border-[#222]">
              <button
                type="button"
                onClick={() => setLojaAcoesModal(null)}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-[#181818] hover:bg-[#222] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
