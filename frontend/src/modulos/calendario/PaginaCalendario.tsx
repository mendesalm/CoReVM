import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { clienteHttp, API_URL } from '../../compartilhado/contextos/AuthContext';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Loader2, ShieldCheck, Calendar, List, Plus, Clock, Building2, CalendarPlus, Download, ChevronRight, ChevronDown, Palette } from 'lucide-react';
import { CampoData, CampoHora } from '../../compartilhado/componentes/SeletorDataHora';
import { gerarLinkGoogleCalendar, baixarArquivoIcs } from '../../compartilhado/utilitarios/calendarioExport';
import { feedbackTatil } from '../../compartilhado/utilitarios/dispositivoNativo';

// CORREÇÃO (2026-09-19): esta tela era 100% mock — nunca chamava
// GET /agenda/eventos (o calendário sempre começava vazio) e criar/editar/
// excluir evento só mudava um estado local no navegador, sem nunca chamar
// o backend (as 4 rotas de `agenda/eventos` já existiam prontas desde
// 2026-09-15). Também ainda usava o header pré-fix de segurança
// `X-User-Id: superadmin` (padrão já corrigido em outras telas na auditoria
// de 2026-09-11). Reescrita para integração completa com o backend real:
// carregar, criar, editar e cancelar eventos agora persistem de verdade,
// respeitando o catálogo fechado de 9 tipos de evento (cada um com âmbito
// Conselho/Loja/Ambos e regra de quem pode lançar — ver TIPOS_EVENTO_AGENDA
// em `CoReVM/backend/api/v1/regional/rotas.py`) e a trava de Loja
// organizadora sempre = a do usuário logado (nunca escolhida livremente,
// o backend nem aceita esse campo do cliente). Achado durante o teste do
// widget "Eventos da Loja" do painel "Minha Loja" (ver Bloco B.4 do roteiro
// de testes manuais).

// Mesma normalização de erro 422/validação já usada em PaginaLojas.tsx e
// PaginaAdmissoes.tsx — o `detail` de um 422 do FastAPI é uma LISTA de
// objetos ({type, loc, msg, input}), não uma string.
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

interface TipoEventoInfo {
  tipo: string;
  rotulo: string;
  ambito: 'CONSELHO' | 'LOJA' | 'AMBOS';
  quem_lanca: string;
  subtipos_validos: string[] | null;
}

interface EventoAgendaItem {
  id: string;
  regiao_id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  subtipo: string | null;
  data_inicio: string;
  data_fim: string | null;
  loja_organizadora_id: string | null;
  loja_organizadora_nome: string | null;
  loja_organizadora_numero: string | null;
  criado_por_id: string;
  criado_por_nome: string;
  criado_por_tipo: string;
  previa_admissao_id: string | null;
  aviso_gerado_id: string | null;
  status: 'AGENDADO' | 'REALIZADO' | 'CANCELADO';
  criado_em: string | null;
  pode_editar: boolean;
}

// Cor por tipo (o backend não guarda cor — era um campo puramente visual da
// v1 mock, que se perdia a cada recarga; agora a cor é derivada do tipo,
// consistente para todo mundo).
const COR_POR_TIPO: Record<string, string> = {
  REUNIAO_ADMINISTRATIVA: '#0891b2',
  ENCONTRO_REGIONAL: '#2563eb',
  CONFERENCIA: '#7c3aed',
  SESSAO_MAGNA: '#eab308',
  SESSAO_PUBLICA: '#16a34a',
  AGAPE_RITUALISTICO: '#ea580c',
  EVENTO_BENEFICENTE: '#db2777',
  EVENTO_ARRECADACAO: '#059669',
  HOMENAGEM_EXTERNA: '#64748b',
};
const COR_PADRAO = '#eab308';

const SUBTIPO_ROTULOS: Record<string, string> = {
  INICIACAO: 'Iniciação',
  ELEVACAO: 'Elevação',
  EXALTACAO: 'Exaltação',
  POSSE: 'Posse',
  INSTALACAO: 'Instalação',
  COMEMORATIVA: 'Comemorativa',
};

const STATUS_ROTULOS: Record<string, string> = {
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
};

export default function PaginaCalendario() {
  // Fix for FullCalendar width calculation on initial load
  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    return () => clearTimeout(timer);
  }, []);
  const { id: regiaoId } = useParams();

  const [userContext, setUserContext] = useState<any>(null);
  const [tiposEvento, setTiposEvento] = useState<TipoEventoInfo[]>([]);
  const [eventos, setEventos] = useState<EventoAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros do mural
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [mostrarLegenda, setMostrarLegenda] = useState(false);

  // Modo de visualização responsivo: 'lista' (feed ergonômico mobile) ou 'calendario' (grid mensal)
  const [modoVisualizacao, setModoVisualizacao] = useState<'lista' | 'calendario'>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'lista' : 'calendario';
  });
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    setErro('');
    try {
      const [resMe, resTipos] = await Promise.all([
        clienteHttp.get(`${API_URL}/regional/${regiaoId}/me`),
        clienteHttp.get(`${API_URL}/regional/${regiaoId}/agenda/tipos-evento`),
      ]);
      setUserContext(resMe.data);
      setTiposEvento(resTipos.data || []);
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Não foi possível carregar seu contexto de acesso ao Conselho.'));
      setLoading(false);
      return;
    }

    await carregarEventos();
    setLoading(false);
  };

  const carregarEventos = async () => {
    try {
      const params: any = {};
      if (filtroTipo !== 'TODOS') params.tipo = filtroTipo;
      if (filtroStatus !== 'TODOS') params.status = filtroStatus;
      const res = await clienteHttp.get(`${API_URL}/regional/${regiaoId}/agenda/eventos`, { params });
      setEventos(res.data || []);
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Não foi possível carregar os eventos da agenda.'));
    }
  };

  useEffect(() => {
    if (regiaoId) carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiaoId]);

  useEffect(() => {
    if (regiaoId && userContext) carregarEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroStatus]);

  // Tipos que o usuário logado tem permissão de lançar, segundo o âmbito
  // fechado do catálogo (mesma regra validada de novo no backend — aqui só
  // evita oferecer uma opção que o servidor vai rejeitar).
  const tiposPermitidos = useMemo(() => {
    if (!userContext) return [];
    return tiposEvento.filter((t) => {
      if (t.ambito === 'CONSELHO') return userContext.is_diretoria;
      if (t.ambito === 'LOJA') return !!userContext.loja_id;
      return userContext.is_diretoria || !!userContext.loja_id; // AMBOS
    });
  }, [tiposEvento, userContext]);

  // Form State (criação/edição)
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState<EventoAgendaItem | null>(null);

  const [eventId, setEventId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('');
  const [subtipo, setSubtipo] = useState('');
  const [statusEvento, setStatusEvento] = useState('AGENDADO');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  const [gerarAviso, setGerarAviso] = useState(false);

  const tipoInfoSelecionado = tiposEvento.find((t) => t.tipo === tipo);
  const somenteLeitura = isEditing && eventoSelecionado ? !eventoSelecionado.pode_editar : false;

  const resetForm = () => {
    setEventId('');
    setTitulo('');
    setDescricao('');
    setTipo(tiposPermitidos[0]?.tipo || '');
    setSubtipo('');
    setStatusEvento('AGENDADO');
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
    setIsAllDay(true);
    setGerarAviso(false);
    setEventoSelecionado(null);
  };

  const handleDateClick = (arg: any) => {
    resetForm();
    setStartDate(arg.dateStr);
    setEndDate(arg.dateStr);
    setIsEditing(false);
    setShowModal(true);
  };

  const abrirDetalheDoEvento = (evento: EventoAgendaItem) => {
    setEventoSelecionado(evento);
    setEventId(evento.id);
    setTitulo(evento.titulo);
    setDescricao(evento.descricao || '');
    setTipo(evento.tipo);
    setSubtipo(evento.subtipo || '');
    setStatusEvento(evento.status);
    setGerarAviso(false);

    const inicio = new Date(evento.data_inicio);
    const ehDiaInteiro = inicio.getUTCHours() === 0 && inicio.getUTCMinutes() === 0
      && (!evento.data_fim || (new Date(evento.data_fim).getUTCHours() === 0 && new Date(evento.data_fim).getUTCMinutes() === 0));
    setIsAllDay(ehDiaInteiro);
    setStartDate(evento.data_inicio.slice(0, 10));
    setStartTime(evento.data_inicio.slice(11, 16));
    if (evento.data_fim) {
      setEndDate(evento.data_fim.slice(0, 10));
      setEndTime(evento.data_fim.slice(11, 16));
    } else {
      setEndDate(evento.data_inicio.slice(0, 10));
      setEndTime('');
    }

    setIsEditing(true);
    setShowModal(true);
  };

  const handleEventClick = (arg: any) => {
    const evento: EventoAgendaItem = arg.event.extendedProps.eventoOriginal;
    abrirDetalheDoEvento(evento);
  };

  const handleSalvarEvento = async () => {
    if (!titulo.trim() || !tipo || !startDate) return;
    setSalvando(true);
    try {
      const dataInicio = isAllDay ? `${startDate}T00:00:00` : `${startDate}T${startTime || '00:00'}:00`;
      const dataFim = endDate
        ? (isAllDay ? `${endDate}T00:00:00` : `${endDate}T${endTime || '00:00'}:00`)
        : undefined;

      if (isEditing && eventId) {
        await clienteHttp.put(`${API_URL}/regional/${regiaoId}/agenda/eventos/${eventId}`, {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
          subtipo: tipo === 'SESSAO_MAGNA' ? (subtipo || null) : null,
          data_inicio: dataInicio,
          data_fim: dataFim,
          status: statusEvento,
        });
      } else {
        await clienteHttp.post(`${API_URL}/regional/${regiaoId}/agenda/eventos`, {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
          subtipo: tipo === 'SESSAO_MAGNA' ? (subtipo || null) : null,
          data_inicio: dataInicio,
          data_fim: dataFim,
          gerar_aviso: gerarAviso,
        });
      }
      feedbackTatil.sucesso();
      setShowModal(false);
      resetForm();
      await carregarEventos();
    } catch (err: any) {
      feedbackTatil.erro();
      alert(extrairMensagemErro(err, isEditing ? 'Erro ao atualizar evento' : 'Erro ao criar evento'));
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirEvento = async () => {
    if (!eventId) return;
    if (!confirm('Deseja realmente cancelar este evento? Ele continuará visível no histórico, marcado como Cancelado.')) return;
    setSalvando(true);
    try {
      await clienteHttp.delete(`${API_URL}/regional/${regiaoId}/agenda/eventos/${eventId}`);
      feedbackTatil.aviso();
      setShowModal(false);
      resetForm();
      await carregarEventos();
    } catch (err: any) {
      feedbackTatil.erro();
      alert(extrairMensagemErro(err, 'Erro ao cancelar evento'));
    } finally {
      setSalvando(false);
    }
  };

  // Eventos no formato do FullCalendar, derivados de `eventos` (nenhum
  // estado local paralelo — a UI reflete sempre o que veio do backend).
  const eventosCalendario = useMemo(() => {
    const eventosVisiveis = (mostrarCancelados || filtroStatus === 'CANCELADO')
      ? eventos
      : eventos.filter((e) => e.status !== 'CANCELADO');
    return eventosVisiveis.map((e) => {
      const cor = COR_POR_TIPO[e.tipo] || COR_PADRAO;
      const inicio = new Date(e.data_inicio);
      const ehDiaInteiro = inicio.getUTCHours() === 0 && inicio.getUTCMinutes() === 0
        && (!e.data_fim || (new Date(e.data_fim).getUTCHours() === 0 && new Date(e.data_fim).getUTCMinutes() === 0));

      let end: string | undefined = e.data_fim || undefined;
      if (ehDiaInteiro && e.data_fim) {
        // FullCalendar trata `end` de evento de dia inteiro como exclusivo —
        // soma 1 dia para o último dia informado aparecer incluído.
        const fim = new Date(e.data_fim);
        fim.setUTCDate(fim.getUTCDate() + 1);
        end = fim.toISOString();
      }

      return {
        id: e.id,
        title: e.titulo,
        start: e.data_inicio,
        end,
        allDay: ehDiaInteiro,
        backgroundColor: cor,
        borderColor: cor,
        classNames: e.status === 'CANCELADO' ? ['opacity-40', 'line-through'] : [],
        extendedProps: { eventoOriginal: e },
      };
    });
  }, [eventos, mostrarCancelados, filtroStatus]);

  // Lista ordenada cronologicamente para a visualização em Feed / Lista Mobile
  const eventosOrdenados = useMemo(() => {
    const eventosVisiveis = (mostrarCancelados || filtroStatus === 'CANCELADO')
      ? [...eventos]
      : eventos.filter((e) => e.status !== 'CANCELADO');

    return eventosVisiveis.sort((a, b) => {
      return new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime();
    });
  }, [eventos, mostrarCancelados, filtroStatus]);

  const renderEventContent = (eventInfo: any) => {
    const evento: EventoAgendaItem = eventInfo.event.extendedProps.eventoOriginal;
    return (
      <div className="flex flex-col p-0.5 px-1 overflow-hidden w-full text-white">
        <span className="font-semibold text-xs truncate leading-tight">{eventInfo.event.title}</span>
        <span className="opacity-75 truncate text-[9px] uppercase tracking-wider font-bold mt-0.5 border-t border-white/20 pt-0.5">
          {evento.loja_organizadora_nome
            ? `Loja ${evento.loja_organizadora_numero || ''} — ${evento.loja_organizadora_nome.replace('[TESTE-CORE] ', '')}`
            : 'Conselho Regional'}
          {evento.status === 'REALIZADO' ? ' · Realizado' : ''}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin title-sigma-gold" />
        <span className="text-sm">Carregando Agenda do Conselho...</span>
      </div>
    );
  }

  if (erro && eventos.length === 0 && !userContext) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="max-w-md w-full p-8 text-center bg-sigma-surface border border-sigma-border rounded-2xl shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto bg-sigma-elevated border border-sigma-border border border-amber-500/20 rounded-2xl flex items-center justify-center title-sigma-gold">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Não foi possível abrir a Agenda</h2>
            <p className="text-xs text-gray-400">{erro}</p>
          </div>
          <button
            onClick={() => carregarDados()}
            className="w-full py-2.5 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-bold text-xs rounded-xl transition-all shadow-md"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 h-full flex flex-col relative pb-24 sm:pb-8">
      {/* Cabeçalho com Título, Alternador de Visão e Filtros */}
      <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold title-sigma-gold">Calendário Regional</h1>
            
            {/* Alternador de Visão no topo para Mobile */}
            <div className="flex md:hidden bg-[#161616] p-1 rounded-xl border border-sigma-border">
              <button
                type="button"
                onClick={() => {
                  feedbackTatil.clique();
                  setModoVisualizacao('lista');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  modoVisualizacao === 'lista'
                    ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Lista
              </button>
              <button
                type="button"
                onClick={() => {
                  feedbackTatil.clique();
                  setModoVisualizacao('calendario');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  modoVisualizacao === 'calendario'
                    ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Mês
              </button>
            </div>
          </div>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            {modoVisualizacao === 'lista'
              ? 'Próximos eventos e sessões ordenados cronologicamente.'
              : 'Clique num dia para criar, ou num evento para ver detalhes.'}
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 text-xs w-full lg:w-auto">
          {/* Alternador Desktop */}
          <div className="hidden md:flex bg-sigma-surface p-1 rounded-xl border border-sigma-border">
            <button
              type="button"
              onClick={() => setModoVisualizacao('lista')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                modoVisualizacao === 'lista'
                  ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setModoVisualizacao('calendario')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                modoVisualizacao === 'calendario'
                  ? 'bg-sigma-gold text-[#070F1E] shadow-md shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Calendário
            </button>
          </div>

          {/* Grupo de Filtros Unificado */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center bg-sigma-surface border border-sigma-border rounded-xl p-1 gap-1">
            
            <div className="flex items-center flex-1">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="bg-transparent text-gray-300 font-medium px-2 py-1.5 focus:outline-none cursor-pointer flex-1 min-w-0 hover:text-white border-r border-sigma-border appearance-none"
              >
                <option value="TODOS" className="bg-sigma-surface">Todos os tipos</option>
                {tiposEvento.map((t) => (
                  <option key={t.tipo} value={t.tipo} className="bg-sigma-surface">{t.rotulo}</option>
                ))}
              </select>
              
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="bg-transparent text-gray-300 font-medium px-2 py-1.5 focus:outline-none cursor-pointer flex-1 min-w-0 hover:text-white md:border-r border-sigma-border appearance-none"
              >
                <option value="TODOS" className="bg-sigma-surface">Todos os status</option>
                {Object.entries(STATUS_ROTULOS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor} className="bg-sigma-surface">{rotulo}</option>
                ))}
              </select>
            </div>

            <div className="hidden md:block w-px h-5 bg-sigma-elevated mx-1" />
            <div className="md:hidden w-full h-px bg-sigma-elevated my-0.5" />

            <div className="flex items-center">
              <label className="flex flex-1 md:flex-none justify-center md:justify-start items-center gap-1.5 px-3 py-1.5 font-medium text-gray-300 hover:text-white cursor-pointer select-none transition-colors border-r border-sigma-border">
                <input
                  type="checkbox"
                  checked={mostrarCancelados}
                  onChange={(e) => setMostrarCancelados(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#facc15] bg-sigma-elevated border-sigma-border rounded"
                />
                Cancelados
              </label>

              <button
                type="button"
                onClick={() => setMostrarLegenda(!mostrarLegenda)}
                className={`flex flex-1 md:flex-none justify-center md:justify-start items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors ${mostrarLegenda ? 'bg-sigma-elevated border border-sigma-border title-sigma-gold' : 'text-gray-400 hover:text-white hover:bg-sigma-elevated'}`}
              >
                <Palette className="w-3.5 h-3.5" />
                Legenda
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mostrarLegenda ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Botão Novo Evento no Desktop */}
          {tiposPermitidos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                const hoje = new Date().toISOString().slice(0, 10);
                setStartDate(hoje);
                setEndDate(hoje);
                setIsEditing(false);
                setShowModal(true);
              }}
              className="hidden md:flex items-center gap-2 ml-auto px-4 py-2 bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 font-bold rounded-xl transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              Novo Evento
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
          {erro}
        </div>
      )}

      {/* Legenda de cores por tipo (Accordion) */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${mostrarLegenda ? 'max-h-96 opacity-100 mb-4' : 'max-h-0 opacity-0 m-0'}`}>
        <div className="bg-sigma-surface border border-sigma-border rounded-xl p-4 shadow-xl">
          <h3 className="text-xs font-bold text-gray-300 mb-3 uppercase tracking-wider">Legenda de Cores</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3 text-[11px] text-gray-400">
            {tiposEvento.map((t) => (
              <div key={t.tipo} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: COR_POR_TIPO[t.tipo] || COR_PADRAO }} />
                <span className="font-medium truncate" title={t.rotulo}>{t.rotulo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Renderização condicional: Visão Lista (Feed Mobile) vs Visão Calendário Mensal */}
      {modoVisualizacao === 'lista' ? (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {eventosOrdenados.length === 0 ? (
            <div className="bg-sigma-surface border border-sigma-border rounded-2xl p-8 text-center text-gray-400 my-6">
              <Calendar className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <p className="font-semibold text-white">Nenhum evento encontrado</p>
              <p className="text-xs text-gray-500 mt-1">Ajuste os filtros ou crie um novo compromisso na agenda.</p>
            </div>
          ) : (
            eventosOrdenados.map((evento) => {
              const dataObj = new Date(evento.data_inicio);
              const diaNum = dataObj.toLocaleDateString('pt-BR', { day: '2-digit' });
              const mesCurto = dataObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
              const diaSemana = dataObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
              const cor = COR_POR_TIPO[evento.tipo] || COR_PADRAO;
              const ehDiaInteiro = dataObj.getUTCHours() === 0 && dataObj.getUTCMinutes() === 0;
              const horarioStr = ehDiaInteiro ? 'Dia Inteiro' : dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={evento.id}
                  onClick={() => abrirDetalheDoEvento(evento)}
                  className={`bg-sigma-surface hover:bg-sigma-elevated active:bg-[#202020] border border-sigma-border hover:border-[#444] rounded-2xl p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-md ${
                    evento.status === 'CANCELADO' ? 'opacity-40 line-through' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Badge de Data */}
                    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-[#090909] border border-[#2e2e2e] flex-shrink-0 text-center">
                      <span className="text-[10px] font-bold text-gray-400 leading-tight">{mesCurto}</span>
                      <span className="text-xl font-extrabold title-sigma-gold leading-none my-0.5">{diaNum}</span>
                      <span className="text-[9px] font-medium text-gray-500 leading-tight">{diaSemana}</span>
                    </div>

                    {/* Informações do Evento */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-black uppercase tracking-wider"
                          style={{ backgroundColor: cor }}
                        >
                          {tiposEvento.find(t => t.tipo === evento.tipo)?.rotulo || evento.tipo}
                        </span>
                        {evento.subtipo && (
                          <span className="text-[10px] font-medium text-amber-300/80 bg-sigma-elevated border border-sigma-border border border-amber-500/20 px-1.5 py-0.5 rounded">
                            {SUBTIPO_ROTULOS[evento.subtipo] || evento.subtipo}
                          </span>
                        )}
                        {evento.status === 'REALIZADO' && (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Realizado
                          </span>
                        )}
                        {evento.status === 'CANCELADO' && (
                          <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                            Cancelado
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-white text-sm sm:text-base leading-snug truncate">
                        {evento.titulo}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1 text-gray-300 font-medium">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          {horarioStr}
                        </span>
                        <span className="flex items-center gap-1 truncate text-gray-400">
                          <Building2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          <span className="truncate">
                            {evento.loja_organizadora_nome
                              ? `Loja ${evento.loja_organizadora_numero || ''} — ${evento.loja_organizadora_nome.replace('[TESTE-CORE] ', '')}`
                              : 'Conselho Regional'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-sigma-surface border border-sigma-border rounded-xl p-3 sm:p-6 flex-1 text-gray-300 min-h-[450px]">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={eventosCalendario}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            eventDisplay="block"
            editable={false}
            droppable={false}
            headerToolbar={isMobile ? {
              left: 'prev,next',
              center: 'title',
              right: 'today'
            } : {
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            height="100%"
            locale={ptBrLocale}
            buttonText={{
              today: 'Hoje',
              month: 'Mês',
              week: 'Semana',
              day: 'Dia',
            }}
          />
        </div>
      )}

      {/* Floating Action Button (FAB) Mobile para Criar Evento */}
      {tiposPermitidos.length > 0 && (
        <button
          type="button"
          onClick={() => {
            feedbackTatil.clique();
            resetForm();
            const hoje = new Date().toISOString().slice(0, 10);
            setStartDate(hoje);
            setEndDate(hoje);
            setIsEditing(false);
            setShowModal(true);
          }}
          aria-label="Novo Evento"
          className="md:hidden fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-sigma-gold text-[#070F1E] shadow-md hover:bg-[#eab308] active:scale-95 text-black shadow-2xl flex items-center justify-center transition-all border-2 border-amber-300/40"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-sigma-surface border border-sigma-border rounded-xl p-6 w-full max-w-lg my-auto">
            <h2 className="text-xl font-bold title-sigma-gold mb-1">
              {isEditing ? (somenteLeitura ? 'Detalhes do Evento' : 'Editar Evento') : 'Novo Evento'}
            </h2>
            {isEditing && eventoSelecionado && (
              <p className="text-xs text-gray-500 mb-4">
                Lançado por {eventoSelecionado.criado_por_nome}
                {eventoSelecionado.criado_em ? ` em ${new Date(eventoSelecionado.criado_em).toLocaleDateString('pt-BR')}` : ''}
                {somenteLeitura ? ' — somente leitura (você não organizou este evento)' : ''}
              </p>
            )}
            {!isEditing && <div className="mb-4" />}

            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSalvarEvento(); }}>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Título do Evento</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder="Reunião de Veneráveis..."
                  required
                  disabled={somenteLeitura}
                  className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Tipo de Evento</label>
                  <select
                    value={tipo}
                    onChange={e => { setTipo(e.target.value); setSubtipo(''); }}
                    required
                    disabled={somenteLeitura}
                    className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60 cursor-pointer"
                  >
                    <option value="" disabled>Selecione...</option>
                    {tiposPermitidos.map((t) => (
                      <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>
                    ))}
                    {/* Se o evento em edição tiver um tipo fora do que este usuário pode lançar
                        (ex.: Diretoria editando um evento de Loja), mantém a opção visível. */}
                    {isEditing && tipo && !tiposPermitidos.some(t => t.tipo === tipo) && tipoInfoSelecionado && (
                      <option value={tipo}>{tipoInfoSelecionado.rotulo}</option>
                    )}
                  </select>
                </div>

                {tipo === 'SESSAO_MAGNA' && tipoInfoSelecionado?.subtipos_validos && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Subtipo</label>
                    <select
                      value={subtipo}
                      onChange={e => setSubtipo(e.target.value)}
                      required
                      disabled={somenteLeitura}
                      className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60 cursor-pointer"
                    >
                      <option value="" disabled>Selecione...</option>
                      {tipoInfoSelecionado.subtipos_validos.map((s) => (
                        <option key={s} value={s}>{SUBTIPO_ROTULOS[s] || s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-500 -mt-2">
                Organizador: {tipoInfoSelecionado?.ambito === 'CONSELHO'
                  ? 'Conselho Regional (Mesa Diretora)'
                  : userContext?.loja_id
                    ? `Sua Loja (nº ${userContext.loja_id})`
                    : 'Conselho Regional'} — definido automaticamente pelo seu vínculo, não é possível escolher outra Loja.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Detalhamento / Informações Extras</label>
                <textarea
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  placeholder="Instruções sobre trajes, pauta, links ou detalhes adicionais..."
                  disabled={somenteLeitura}
                  className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none resize-none h-24 disabled:opacity-60"
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="allday"
                  checked={isAllDay}
                  onChange={e => setIsAllDay(e.target.checked)}
                  disabled={somenteLeitura}
                  className="w-4 h-4 accent-[#facc15] bg-sigma-bg border-sigma-border rounded"
                />
                <label htmlFor="allday" className="text-sm font-medium text-gray-300 cursor-pointer">Dia Inteiro (Sem horário fixo)</label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Data de Início</label>
                  <CampoData
                    value={startDate}
                    onChange={(v) => setStartDate(v)}
                    disabled={somenteLeitura}
                    className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60"
                  />
                </div>
                {!isAllDay && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Hora de Início</label>
                    <CampoHora
                      value={startTime}
                      onChange={(v) => setStartTime(v)}
                      disabled={somenteLeitura}
                      className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Data de Término</label>
                  <CampoData
                    value={endDate}
                    onChange={(v) => setEndDate(v)}
                    disabled={somenteLeitura}
                    className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60"
                  />
                </div>
                {!isAllDay && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Hora de Término</label>
                    <CampoHora
                      value={endTime}
                      onChange={(v) => setEndTime(v)}
                      disabled={somenteLeitura}
                      className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none disabled:opacity-60"
                    />
                  </div>
                )}
              </div>

              {isEditing && !somenteLeitura && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                  <select
                    value={statusEvento}
                    onChange={e => setStatusEvento(e.target.value)}
                    className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none cursor-pointer"
                  >
                    {Object.entries(STATUS_ROTULOS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>{rotulo}</option>
                    ))}
                  </select>
                </div>
              )}

              {!isEditing && (
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="gerar-aviso"
                    checked={gerarAviso}
                    onChange={e => setGerarAviso(e.target.checked)}
                    className="w-4 h-4 accent-[#facc15] bg-sigma-bg border-sigma-border rounded"
                  />
                  <label htmlFor="gerar-aviso" className="text-sm font-medium text-gray-300 cursor-pointer">
                    Publicar também um Aviso de lembrete no Mural
                  </label>
                </div>
              )}

              {/* Ações de Sincronização com Calendário do Usuário (Google e Apple Calendar) */}
              {isEditing && eventoSelecionado && (
                <div className="bg-sigma-elevated border border-[#2d2d2d] rounded-xl p-3 my-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <CalendarPlus className="w-4 h-4 title-sigma-gold" />
                    <span className="text-xs font-semibold text-gray-200">Sincronizar no seu celular:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={gerarLinkGoogleCalendar({
                        titulo: eventoSelecionado.titulo,
                        descricao: eventoSelecionado.descricao || '',
                        local: eventoSelecionado.loja_organizadora_nome
                          ? `Loja ${eventoSelecionado.loja_organizadora_numero || ''} — ${eventoSelecionado.loja_organizadora_nome}`
                          : 'Conselho Regional',
                        dataInicio: eventoSelecionado.data_inicio,
                        dataFim: eventoSelecionado.data_fim,
                        diaInteiro: isAllDay,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sigma-elevated hover:bg-[#333] border border-[#444] rounded-lg text-[11px] font-medium text-gray-200 hover:text-white transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      Google Agenda
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        baixarArquivoIcs({
                          titulo: eventoSelecionado.titulo,
                          descricao: eventoSelecionado.descricao || '',
                          local: eventoSelecionado.loja_organizadora_nome
                            ? `Loja ${eventoSelecionado.loja_organizadora_numero || ''} — ${eventoSelecionado.loja_organizadora_nome}`
                            : 'Conselho Regional',
                          dataInicio: eventoSelecionado.data_inicio,
                          dataFim: eventoSelecionado.data_fim,
                          diaInteiro: isAllDay,
                        });
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sigma-elevated hover:bg-[#333] border border-[#444] rounded-lg text-[11px] font-medium text-gray-200 hover:text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      Apple / iCal
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-sigma-border pt-4 flex justify-between items-center mt-4">
                {isEditing && !somenteLeitura ? (
                  <button
                    type="button"
                    onClick={handleExcluirEvento}
                    disabled={salvando}
                    className="text-red-500 hover:text-red-400 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Cancelar Evento
                  </button>
                ) : <div />}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                  >
                    Fechar
                  </button>
                  {!somenteLeitura && (
                    <button
                      type="submit"
                      disabled={salvando || !tipo}
                      className="bg-sigma-gold text-[#070F1E] shadow-md hover:bg-[#eab308] disabled:opacity-50 text-black px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isEditing ? 'Atualizar Evento' : 'Salvar Evento'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .fc-theme-standard .fc-scrollgrid, .fc-theme-standard th, .fc-theme-standard td { border-color: #333; }
        .fc-col-header-cell-cushion { color: #facc15; }
        .fc-daygrid-day-number { color: #aaa; }
        .fc-button-primary { background-color: #333 !important; border-color: #444 !important; }
        .fc-button-primary:hover { background-color: #444 !important; }
        .fc-button-active { background-color: #facc15 !important; color: black !important; border-color: #facc15 !important; }
        .fc .fc-toolbar-title { color: #fff; font-weight: bold; }
        .fc-event { cursor: pointer; border-radius: 4px; overflow: hidden; margin-bottom: 2px !important; }
        .fc-daygrid-event-harness { margin-top: 2px !important; }
      `}</style>
    </div>
  );
}
