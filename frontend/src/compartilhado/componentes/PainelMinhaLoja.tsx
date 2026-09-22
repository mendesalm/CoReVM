// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { clienteHttp } from '../contextos/AuthContext';
import { CampoData, CampoHora } from './SeletorDataHora';
import {
  Building2, Award, Users, AlertTriangle, CheckCircle2, Edit3,
  UserCog, Zap, ArrowLeft, Loader2, Clock, Mail, Phone, IdCard,
  Calendar, FileText, BookOpenCheck, ChevronRight, X, Plus,
  MapPin, Globe, Hash, CalendarClock, Send, Upload, CheckSquare, Trash2, Copy, RotateCcw
} from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

// ALTERAÇÃO (2026-09-18, a pedido do usuário -- depois de ver a primeira
// versão do atalho "Minha Loja", que só filtrava a tabela genérica de
// "Lojas Jurisdicionadas" e reaproveitava os widgets do módulo inteiro
// (título "Módulo 07", métricas "Lojas Jurisdicionadas"/"Com VM"/"Mandatos
// Pendentes"): esses widgets fazem sentido para a visão de TODAS as Lojas
// da Região, não para o painel pessoal de UMA Loja só. Esta tela é nova,
// desenhada como painel (cartões de informação), não como tabela.
//
// Reaproveita os modais e handlers já existentes em PaginaLojas.tsx (Gestão
// de VM, Edição de Loja, Designação de Suplente, Transmissão Emergencial)
// via callbacks passados por prop -- nenhuma lógica de negócio foi
// duplicada, só a apresentação visual é diferente.
//
// ALTERAÇÃO (2026-09-21, a pedido do usuário -- reformulação de design):
// "Dados da Loja" passou a ocupar a largura inteira e mostrar todos os
// campos cadastrais (não só os 4 originais); "Venerável Mestre" passou a
// incluir o Suplente do Conselho no mesmo cartão (2 seções internas); os
// widgets de Eventos/Documentos/Editais passaram a ficar em grid de 3
// colunas no desktop, e cada um ganhou um modal de gerenciamento completo
// (lista integral + formulário de criação embutido), reaproveitando os
// MESMOS endpoints já usados pelas telas cheias de Agenda, Documentos e
// Admissões (nenhuma rota nova) -- só a apresentação passou a caber dentro
// do painel da própria Loja, sem precisar navegar para outro módulo.
// Ver claude/roteiro-testes-manuais.md, item B.11, no Project "Core".

interface PainelMinhaLojaProps {
  loja: any;
  regiaoId: string | undefined;
  userContext: any;
  onAbrirGestaoVM: () => void;
  onAbrirEdicaoLoja: () => void;
  onAbrirDesignarSuplente: () => void;
  onAbrirTransmissaoEmergencial: () => void;
}

// Calcula "X anos e Y meses" a partir da data de início do mandato --
// pedido explícito do usuário ("duração do mandato").
function formatarDuracaoMandato(dataInicioIso: string | null | undefined): string {
  if (!dataInicioIso) return 'Data de início não registrada';
  const inicio = new Date(dataInicioIso);
  if (isNaN(inicio.getTime())) return 'Data de início não registrada';
  const hoje = new Date();

  let meses = (hoje.getFullYear() - inicio.getFullYear()) * 12 + (hoje.getMonth() - inicio.getMonth());
  if (hoje.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 0) meses = 0;

  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (mesesRestantes > 0 || partes.length === 0) {
    partes.push(`${mesesRestantes} ${mesesRestantes === 1 ? 'mês' : 'meses'}`);
  }
  return partes.join(' e ') + ' de mandato';
}

function formatarDataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

// Eventos da Agenda: mostra "dd/mm/aaaa" quando o evento é de dia inteiro (hora 00:00,
// mesma convenção usada em toda a Agenda -- ver PaginaCalendario.tsx) ou "dd/mm/aaaa às
// HH:MM" quando tem horário definido. Lê direto da string ISO (sem passar por Date/fuso)
// porque `data_inicio` já chega como 'YYYY-MM-DDTHH:MM:SS', igual ao que o próprio
// formulário deste painel usa para popular os campos Data/Horário ao editar um evento.
function formatarDataHoraEvento(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '—';
  const dataBR = `${dia}/${mes}/${ano}`;
  const hora = iso.slice(11, 16);
  return hora && hora !== '00:00' ? `${dataBR} às ${hora}` : dataBR;
}

function extrairMensagemErro(err: any, mensagemPadrao: string): string {
  return err?.response?.data?.detail || err?.message || mensagemPadrao;
}

// Campo simples de exibição para o cartão "Dados da Loja" (rótulo + valor,
// com fallback "—" quando vazio) -- evita repetir a mesma marcação 17x.
function CampoDado({ rotulo, valor }: { rotulo: string; valor: any }) {
  return (
    <div>
      <span className="block text-gray-500 mb-1">{rotulo}</span>
      <span className="font-semibold text-gray-200 break-words">{valor || '—'}</span>
    </div>
  );
}

export default function PainelMinhaLoja({
  loja,
  regiaoId,
  userContext,
  onAbrirGestaoVM,
  onAbrirEdicaoLoja,
  onAbrirDesignarSuplente,
  onAbrirTransmissaoEmergencial
}: PainelMinhaLojaProps) {
  const [vmDetalhe, setVmDetalhe] = useState<any>(null);
  const [carregandoVm, setCarregandoVm] = useState(false);

  const temVm = !!loja?.hasVm;

  // ALTERAÇÃO (2026-09-19): Secretário/Chanceler (Operador Administrativo)
  // é um perfil puramente operacional (ver docstring de
  // `OperadorAdministrativoLoja` em backend/models/models.py) — pode editar
  // o cadastro da Loja, pode gerenciar avisos/agenda/documentos/admissões
  // da própria Loja (inclusive por este painel), mas NÃO pode tomar
  // decisões políticas (empossar/trocar VM, designar Suplente do Conselho,
  // transmissão emergencial). Essas ações continuam exclusivas de
  // VM/Diretoria no backend (`_exigir_vm_da_loja_ou_diretoria`) —
  // escondidas aqui pra não oferecer um botão que sempre daria 403 para
  // este perfil.
  const souOperadorAdministrativo = userContext?.role === 'OPERADOR_ADMINISTRATIVO';

  useEffect(() => {
    if (!loja?.loja_id || !temVm) {
      setVmDetalhe(null);
      return;
    }
    setCarregandoVm(true);
    axios.get(`${API_URL}/integracao/lojas/${loja.loja_id}/vm`)
      .then((res) => setVmDetalhe(res.data?.tem_vm ? res.data : null))
      .catch(() => setVmDetalhe(null))
      .finally(() => setCarregandoVm(false));
  }, [loja?.loja_id, temVm]);

  // ALTERAÇÃO (2026-09-18, a pedido do usuário -- "seria interessante
  // incluir registros da loja em widgets específicos: eventos, documentos,
  // convites, editais de admissão, como um painel gerencial da loja"):
  // listas completas (não só um resumo) das 3 áreas que já guardam o
  // vínculo com a Loja no backend -- nenhuma rota nova foi necessária. Cada
  // widget mostra um resumo compacto + um botão "Ver tudo e gerenciar" que
  // abre um modal com a lista integral e o formulário de criação.
  const [eventos, setEventos] = useState<any[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  // Widget-resumo (topo da página) não tem o checkbox "Mostrar cancelados / encerrados"
  // do modal completo -- por isso filtra sempre, igual ao default do modal (2026-09-22).
  const eventosVigentesWidget = eventos.filter((e: any) => e.status !== 'CANCELADO' && e.status !== 'REALIZADO');
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(false);
  // Mesmo raciocínio para Documentos/Convites: `documentos` agora vem com
  // `incluir_arquivados=true` (para o modal poder mostrar o histórico via seu
  // próprio checkbox), então o widget-resumo precisa filtrar por conta própria.
  const documentosVigentesWidget = documentos.filter((d: any) => !d.arquivado);
  const [previas, setPrevias] = useState<any[]>([]);
  const [carregandoPrevias, setCarregandoPrevias] = useState(false);
  const [tiposEvento, setTiposEvento] = useState<any[]>([]);

  const carregarEventos = () => {
    if (!loja?.loja_id || !regiaoId) return;
    setCarregandoEventos(true);
    // GET /agenda/eventos já aceita ?loja_id= como filtro -- nenhuma rota
    // nova precisou ser criada para este widget.
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/agenda/eventos`, { params: { loja_id: loja.loja_id } })
      .then((res) => setEventos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEventos([]))
      .finally(() => setCarregandoEventos(false));
  };

  const carregarDocumentos = () => {
    if (!loja?.loja_id || !regiaoId) return;
    setCarregandoDocumentos(true);
    // GET /documentos não filtra por loja na query -- filtramos no cliente
    // pelo `loja_emissora_id`, que já vem em cada registro (documentos e
    // convites vivem na mesma tabela, distinguidos por `categoria`).
    // `incluir_arquivados=true` (2026-09-22): o back-end esconde arquivados por
    // padrão -- busca tudo aqui e filtra no cliente (widget-resumo e o modal,
    // que tem o próprio checkbox "Mostrar arquivados") em vez de perder acesso
    // ao histórico ou precisar de uma segunda chamada ao alternar o filtro.
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/documentos`, { params: { incluir_arquivados: true } })
      .then((res) => {
        const todos = Array.isArray(res.data) ? res.data : [];
        setDocumentos(todos.filter((d: any) => String(d.loja_emissora_id) === String(loja.loja_id)));
      })
      .catch(() => setDocumentos([]))
      .finally(() => setCarregandoDocumentos(false));
  };

  const carregarPrevias = () => {
    if (!loja?.loja_id || !regiaoId) return;
    setCarregandoPrevias(true);
    // GET /admissoes também não filtra por loja na query (por desenho, VM
    // vê as prévias de todas as Lojas do conselho) -- filtramos no cliente
    // pelo `loja_id` de cada prévia, igual ao caso de Documentos acima.
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/admissoes`)
      .then((res) => {
        const todas = Array.isArray(res.data) ? res.data : [];
        setPrevias(todas.filter((p: any) => String(p.loja_id) === String(loja.loja_id)));
      })
      .catch(() => setPrevias([]))
      .finally(() => setCarregandoPrevias(false));
  };

  useEffect(() => { carregarEventos(); }, [loja?.loja_id, regiaoId]);
  useEffect(() => { carregarDocumentos(); }, [loja?.loja_id, regiaoId]);
  useEffect(() => { carregarPrevias(); }, [loja?.loja_id, regiaoId]);

  useEffect(() => {
    if (!regiaoId) return;
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/agenda/tipos-evento`)
      .then((res) => setTiposEvento(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTiposEvento([]));
  }, [regiaoId]);

  // Tipos de evento que fazem sentido lançar a partir da própria Loja
  // (mesma regra de ambito usada em PaginaCalendario.tsx -- aqui só evita
  // oferecer uma opção que o servidor rejeitaria).
  const tiposEventoPermitidos = tiposEvento.filter((t) => {
    if (t.ambito === 'CONSELHO') return !!userContext?.is_diretoria;
    return true; // LOJA ou AMBOS -- sempre permitido para quem tem loja_id
  });

  // Modal de gerenciamento (lista completa + criação) por widget.
  const [modalAberto, setModalAberto] = useState<'eventos' | 'documentos' | 'admissoes' | null>(null);

  if (!loja) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-10 text-center text-gray-400">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-[#facc15] animate-spin" />
          Carregando os dados da sua Loja...
        </div>
      </div>
    );
  }

  const ehSuplenteRegente = !!userContext.usuario_id
    && loja.suplente_usuario_id === userContext.usuario_id
    && loja.suplente_pode_indicar_veneravel
    && !temVm;

  const nomeBase = (loja.nome || `#${loja.loja_id}`).replace(/^Loja\s+/i, '');
  const nomeLojaCompleto = loja.numero ? `Loja ${nomeBase}, nº ${loja.numero}` : `Loja ${nomeBase}`;

  const enderecoLinha1 = [loja.logradouro, loja.numero_endereco].filter(Boolean).join(', ')
    + (loja.complemento ? ` — ${loja.complemento}` : '');
  const enderecoLinha2 = [loja.bairro, loja.cidade, loja.estado].filter(Boolean).join(' / ');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* Cabeçalho do Painel */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#facc15]/10 rounded-xl text-[#facc15] border border-[#facc15]/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#facc15] uppercase tracking-wider">Minha Loja</span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-wide">{nomeLojaCompleto}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {souOperadorAdministrativo
                ? 'Painel administrativo do Secretário/Chanceler — dados e gestão da Loja'
                : 'Painel exclusivo do Venerável Mestre — dados e ações da sua própria Loja'}
            </p>
          </div>
        </div>

        <Link
          to={`/regiao/${regiaoId}/lojas`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-[#141414] hover:bg-[#1c1c1c] border border-[#262626] px-3.5 py-2 rounded-xl transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Ver todas as Lojas da Região
        </Link>
      </div>

      {/* Cartão: Dados Cadastrais da Loja -- largura total, todos os campos */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Building2 className="w-4 h-4 text-[#facc15]" /> Dados da Loja
          </div>
          <button
            type="button"
            onClick={onAbrirEdicaoLoja}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 hover:bg-[#facc15]/20 border border-[#facc15]/30 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
            title="Editar cadastro da Loja"
          >
            <Edit3 className="w-3.5 h-3.5" /> Editar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-xs">
          <CampoDado rotulo="Potência" valor={loja.potencia || 'GOB'} />
          <CampoDado rotulo="Rito Trabalhado" valor={loja.rito} />
          <CampoDado rotulo="Número" valor={loja.numero} />
          <CampoDado rotulo="CNPJ" valor={loja.cnpj} />
        </div>

        <div className="pt-3 border-t border-[#232323]">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Endereço
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <CampoDado rotulo="Logradouro" valor={enderecoLinha1 || null} />
            <CampoDado rotulo="Bairro / Cidade / UF" valor={enderecoLinha2 || null} />
            <CampoDado rotulo="CEP" valor={loja.cep} />
          </div>
        </div>

        <div className="pt-3 border-t border-[#232323] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Dia e Horário de Sessão
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <CampoDado rotulo="Dia" valor={loja.dia_sessao} />
              <CampoDado rotulo="Horário" valor={loja.horario_sessao} />
              <CampoDado rotulo="Periodicidade" valor={loja.periodicidade} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Contato Institucional
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="font-semibold text-gray-200 truncate">{loja.email || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="font-semibold text-gray-200 truncate">{loja.telefone || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <Hash className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="font-semibold text-gray-200 truncate">{loja.site || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cartão: Liderança da Loja -- Venerável Mestre + Suplente do
          Conselho em um único cartão, com 2 seções internas (2026-09-21, a
          pedido do usuário: "o widget venerável mestre pode englobar os
          dados do suplente"). */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Seção: Venerável Mestre */}
          <div className="space-y-4 lg:pr-5 lg:border-r lg:border-[#232323]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Award className="w-4 h-4 text-[#facc15]" /> Venerável Mestre
              </div>
              {!souOperadorAdministrativo && (
                <button
                  type="button"
                  onClick={onAbrirGestaoVM}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 hover:bg-[#facc15]/20 border border-[#facc15]/30 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                  title="Gerenciar Venerável Mestre"
                >
                  <UserCog className="w-3.5 h-3.5" /> Gerenciar
                </button>
              )}
            </div>

            {temVm ? (
              carregandoVm ? (
                <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando detalhes do mandato...
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">{loja.veneravel_nome}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-300">
                    {vmDetalhe?.cim && (
                      <div className="flex items-center gap-2">
                        <IdCard className="w-3.5 h-3.5 text-gray-500 shrink-0" /> CIM: {vmDetalhe.cim}
                      </div>
                    )}
                    {vmDetalhe?.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {vmDetalhe.email}
                      </div>
                    )}
                    {vmDetalhe?.telefone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {vmDetalhe.telefone}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-[#232323] flex items-center gap-2 text-[#facc15] text-xs font-semibold">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {formatarDuracaoMandato(vmDetalhe?.data_inicio)}
                      {vmDetalhe?.data_inicio && (
                        <span className="text-gray-500 font-normal"> (desde {formatarDataBR(vmDetalhe.data_inicio)})</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-400/90 font-medium text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Mandato pendente de posse
                </div>
                {!souOperadorAdministrativo && (userContext.is_diretoria || ehSuplenteRegente) && (
                  <button
                    type="button"
                    onClick={onAbrirTransmissaoEmergencial}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-black bg-orange-400 hover:bg-orange-300 rounded-lg transition-colors cursor-pointer"
                    title={ehSuplenteRegente ? 'Indicar o próximo Venerável Mestre (poder de uso único)' : 'Cadastrar novo Venerável Mestre emergencialmente'}
                  >
                    <Zap className="w-3.5 h-3.5" /> {ehSuplenteRegente ? 'Indicar novo VM' : 'Regularizar VM'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Seção: Suplente do Conselho */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Users className="w-4 h-4 text-[#facc15]" /> Suplente do Conselho
              </div>
              {!souOperadorAdministrativo && (
                <button
                  type="button"
                  onClick={onAbrirDesignarSuplente}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                  title={loja.suplente_nome ? 'Trocar Suplente do Conselho' : 'Designar Suplente do Conselho'}
                >
                  <Users className="w-3.5 h-3.5" /> {loja.suplente_nome ? 'Trocar Suplente' : 'Designar Suplente'}
                </button>
              )}
            </div>

            {loja.suplente_nome ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">{loja.suplente_nome}</span>
                  {loja.suplente_pode_indicar_veneravel && !temVm && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-orange-500/15 text-orange-300 border border-orange-500/30"
                      title="Mestre Instalado imediato — pode indicar o próximo VM (poder de uso único)"
                    >
                      Mestre Instalado imediato
                    </span>
                  )}
                </div>
                {loja.suplente_email && (
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {loja.suplente_email}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Nenhum Suplente do Conselho designado ainda para esta Loja.</p>
            )}
          </div>

        </div>
      </div>

      {/* Grid de 3 colunas (desktop): Eventos, Documentos/Convites, Editais
          de Admissão -- cada um com resumo + modal de gerenciamento. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Cartão: Próximos Eventos da Loja */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Calendar className="w-4 h-4 text-[#facc15]" /> Eventos da Loja
            </div>
            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0d0d] border border-[#262626] px-2 py-0.5 rounded-full">
              {eventosVigentesWidget.length}
            </span>
          </div>

          {carregandoEventos ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : eventosVigentesWidget.length === 0 ? (
            <p className="text-xs text-gray-500">
              {eventos.length === 0
                ? 'Nenhum evento cadastrado por esta Loja ainda.'
                : 'Nenhum evento vigente no momento.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {eventosVigentesWidget.slice(0, 3).map((e: any) => (
                <li key={e.id} className="text-xs text-gray-300 flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-200 truncate block">{e.titulo}</span>
                    <span className="text-gray-500">{formatarDataHoraEvento(e.data_inicio)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setModalAberto('eventos')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors cursor-pointer"
          >
            Ver tudo e gerenciar <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Cartão: Documentos e Convites da Loja */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <FileText className="w-4 h-4 text-[#facc15]" /> Documentos e Convites
            </div>
            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0d0d] border border-[#262626] px-2 py-0.5 rounded-full">
              {documentosVigentesWidget.length}
            </span>
          </div>

          {carregandoDocumentos ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : documentosVigentesWidget.length === 0 ? (
            <p className="text-xs text-gray-500">
              {documentos.length === 0
                ? 'Nenhum documento publicado por esta Loja ainda.'
                : 'Nenhum documento vigente no momento.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {documentosVigentesWidget.slice(0, 3).map((d: any) => (
                <li key={d.id} className="text-xs text-gray-300 flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-gray-200 truncate block">{d.titulo}</span>
                    <span className="text-gray-500">
                      {d.categoria === 'CONVITE' ? 'Convite' : d.categoria} • {d.data_documento}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setModalAberto('documentos')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors cursor-pointer"
          >
            Ver tudo e gerenciar <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Cartão: Editais de Admissão (Mural de Admissão) */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <BookOpenCheck className="w-4 h-4 text-[#facc15]" /> Editais de Admissão
            </div>
            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0d0d] border border-[#262626] px-2 py-0.5 rounded-full">
              {previas.length}
            </span>
          </div>

          {carregandoPrevias ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : previas.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum edital de admissão postado por esta Loja ainda.</p>
          ) : (
            <ul className="space-y-2">
              {previas.slice(0, 3).map((p: any) => (
                <li key={p.id} className="text-xs text-gray-300 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    <BookOpenCheck className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-200 truncate block">
                        {p.candidato_nome} — {p.tipo_label}
                      </span>
                      <span className="text-gray-500">Postado em {formatarDataBR(p.data_postagem)}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                      p.status === 'CONCLUIDO'
                        ? 'bg-green-500/15 text-green-300 border-green-500/30'
                        : p.status === 'AVERIGUADO'
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {p.status === 'EM_ANDAMENTO' ? 'Em andamento' : p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setModalAberto('admissoes')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors cursor-pointer"
          >
            Ver tudo e gerenciar <ChevronRight className="w-3 h-3" />
          </button>
        </div>

      </div>

      {modalAberto === 'eventos' && (
        <ModalEventos
          regiaoId={regiaoId}
          loja={loja}
          eventos={eventos}
          carregando={carregandoEventos}
          tiposPermitidos={tiposEventoPermitidos}
          onFechar={() => setModalAberto(null)}
          onCriado={carregarEventos}
        />
      )}

      {modalAberto === 'documentos' && (
        <ModalDocumentos
          regiaoId={regiaoId}
          loja={loja}
          documentos={documentos}
          carregando={carregandoDocumentos}
          onFechar={() => setModalAberto(null)}
          onCriado={carregarDocumentos}
        />
      )}

      {modalAberto === 'admissoes' && (
        <ModalAdmissoes
          regiaoId={regiaoId}
          loja={loja}
          previas={previas}
          carregando={carregandoPrevias}
          onFechar={() => setModalAberto(null)}
          onCriado={carregarPrevias}
        />
      )}

    </div>
  );
}

// ---------------------------------------------------------------------
// Componentes de suporte: envelope padrão de modal (overlay + cartão) e
// cabeçalho com botão de fechar, reaproveitados pelos 3 modais abaixo.
// ---------------------------------------------------------------------

function EnvelopeModal({ titulo, icone: Icone, onFechar, children }: { titulo: string; icone: any; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Icone className="w-5 h-5 text-[#facc15]" /> {titulo}
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#1c1c1c] rounded-lg transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BotaoAlternarForm({ mostrando, onClick, label }: { mostrando: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer ${
        mostrando
          ? 'text-gray-300 bg-[#1c1c1c] border border-[#333] hover:bg-[#232323]'
          : 'text-black bg-[#facc15] hover:bg-[#eab308]'
      }`}
    >
      {mostrando ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      {mostrando ? 'Cancelar' : label}
    </button>
  );
}

const campoClasse = "w-full bg-[#080808] border border-[#333] rounded-xl p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none";
const rotuloClasse = "block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1";

// ---------------------------------------------------------------------
// Modal: Eventos da Agenda -- lista completa + criação inline. Mesmo
// endpoint (POST /regional/{id}/agenda/eventos) e mesmo payload usados por
// PaginaCalendario.tsx (título, descrição, tipo, subtipo, datas, dia
// inteiro, gerar aviso) -- nenhuma rota nova.
// ---------------------------------------------------------------------
function ModalEventos({ regiaoId, loja, eventos, carregando, tiposPermitidos, onFechar, onCriado }: {
  regiaoId: string | undefined; loja: any; eventos: any[]; carregando: boolean; tiposPermitidos: any[];
  onFechar: () => void; onCriado: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState(tiposPermitidos[0]?.tipo || '');
  const [subtipo, setSubtipo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [diaInteiro, setDiaInteiro] = useState(true);
  // Default ON a pedido do usuário (2026-09-22): a maioria dos eventos deve mesmo gerar o aviso.
  const [gerarAviso, setGerarAviso] = useState(true);
  // Controla se o usuário já mexeu manualmente no horário, para o default abaixo
  // nunca sobrescrever uma escolha feita por ele.
  const [horaEditadaPeloUsuario, setHoraEditadaPeloUsuario] = useState(false);
  // CRUD completo a pedido do usuário (2026-09-22): antes só dava para criar evento por
  // aqui -- editar/excluir só existia na Agenda completa do Conselho. Null = criando um
  // evento novo; id = editando o evento correspondente (PUT em vez de POST).
  const [eventoEditandoId, setEventoEditandoId] = useState<string | null>(null);
  // Filtro de exibição (2026-09-22): por padrão a lista só mostra eventos ainda vigentes
  // (status AGENDADO). Cancelados/Realizados ("encerrados") só aparecem com este botão ativo.
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);

  const tipoInfo = tiposPermitidos.find((t) => t.tipo === tipo);

  const eventosVisiveis = mostrarEncerrados
    ? eventos
    : eventos.filter((e: any) => e.status !== 'CANCELADO' && e.status !== 'REALIZADO');

  const resetFormularioEvento = () => {
    setTitulo('');
    setDescricao('');
    setSubtipo('');
    setDataInicio('');
    setHoraInicio('');
    setDiaInteiro(true);
    setGerarAviso(true);
    setHoraEditadaPeloUsuario(false);
    setEventoEditandoId(null);
    setTipo(tiposPermitidos[0]?.tipo || '');
  };

  // Clonar um evento Cancelado/Realizado: reabre o form em modo de CRIAÇÃO (POST, não PUT --
  // eventoEditandoId fica null) com título/tipo/subtipo repetidos, mas data e horário em
  // branco, obrigando a escolha de uma nova data. Se o subtipo repetido for Iniciação/
  // Elevação/Exaltação, já pré-preenche o horário padrão da Loja (mesma regra do handler
  // de troca de subtipo).
  const handleClonarEvento = (evento: any) => {
    const subtiposComHorarioPadrao = ['INICIACAO', 'ELEVACAO', 'EXALTACAO'];
    setEventoEditandoId(null);
    setTitulo(evento.titulo || '');
    setDescricao(evento.descricao || '');
    setTipo(evento.tipo || '');
    setSubtipo(evento.subtipo || '');
    setDataInicio('');
    setGerarAviso(true);
    setErro('');
    if (subtiposComHorarioPadrao.includes(evento.subtipo) && loja?.horario_sessao) {
      setHoraInicio(loja.horario_sessao);
      setDiaInteiro(false);
      setHoraEditadaPeloUsuario(false);
    } else {
      setHoraInicio('');
      setDiaInteiro(true);
      setHoraEditadaPeloUsuario(false);
    }
    setMostrarForm(true);
  };

  const handleEditarEvento = (evento: any) => {
    setEventoEditandoId(evento.id);
    setTitulo(evento.titulo || '');
    setDescricao(evento.descricao || '');
    setTipo(evento.tipo || '');
    setSubtipo(evento.subtipo || '');
    const inicio = new Date(evento.data_inicio);
    const ehDiaInteiro = inicio.getUTCHours() === 0 && inicio.getUTCMinutes() === 0;
    setDiaInteiro(ehDiaInteiro);
    setDataInicio((evento.data_inicio || '').slice(0, 10));
    setHoraInicio((evento.data_inicio || '').slice(11, 16));
    // Ao editar, não aplicar o default de horário da Loja por cima do que já está salvo.
    setHoraEditadaPeloUsuario(true);
    setErro('');
    setMostrarForm(true);
  };

  const handleExcluirEvento = async (eventoId: string) => {
    if (!confirm('Deseja realmente cancelar este evento? Ele continuará visível no histórico, marcado como Cancelado.')) return;
    setSalvando(true);
    setErro('');
    try {
      await clienteHttp.delete(`${API_URL}/regional/${regiaoId}/agenda/eventos/${eventoId}`);
      if (eventoEditandoId === eventoId) {
        resetFormularioEvento();
        setMostrarForm(false);
      }
      onCriado();
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Erro ao cancelar evento.'));
    } finally {
      setSalvando(false);
    }
  };

  // Sessões de Iniciação, Elevação e Exaltação (subtipos de SESSAO_MAGNA) seguem,
  // por padrão, o mesmo horário das sessões ordinárias da Loja (loja.horario_sessao,
  // já cadastrado em "Dados da Loja"). Ao escolher um desses subtipos, pré-preenche
  // o horário e desliga "Dia inteiro" -- sem sobrescrever se o usuário já tiver
  // editado o horário manualmente antes.
  const SUBTIPOS_COM_HORARIO_PADRAO_LOJA = ['INICIACAO', 'ELEVACAO', 'EXALTACAO'];
  const handleSubtipoChange = (novoSubtipo: string) => {
    setSubtipo(novoSubtipo);
    if (
      SUBTIPOS_COM_HORARIO_PADRAO_LOJA.includes(novoSubtipo)
      && loja?.horario_sessao
      && !horaEditadaPeloUsuario
    ) {
      setHoraInicio(loja.horario_sessao);
      setDiaInteiro(false);
    }
  };
  const handleHoraInicioChange = (v: string) => {
    setHoraInicio(v);
    setHoraEditadaPeloUsuario(true);
  };

  const handleSalvar = async () => {
    if (!titulo.trim() || !tipo || !dataInicio) {
      setErro('Preencha ao menos título, tipo e data.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const dataInicioIso = diaInteiro ? `${dataInicio}T00:00:00` : `${dataInicio}T${horaInicio || '00:00'}:00`;
      if (eventoEditandoId) {
        // Edição: mesmo endpoint/payload de PUT usado pela Agenda -- não reenvia
        // loja_id (o payload de update nem aceita esse campo) nem gerar_aviso
        // (o Aviso, se pedido, já foi publicado na criação; editar não gera outro).
        await clienteHttp.put(`${API_URL}/regional/${regiaoId}/agenda/eventos/${eventoEditandoId}`, {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
          subtipo: tipo === 'SESSAO_MAGNA' ? (subtipo || null) : null,
          data_inicio: dataInicioIso,
        });
      } else {
        await clienteHttp.post(`${API_URL}/regional/${regiaoId}/agenda/eventos`, {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          tipo,
          subtipo: tipo === 'SESSAO_MAGNA' ? (subtipo || null) : null,
          data_inicio: dataInicioIso,
          loja_id: loja.loja_id,
          gerar_aviso: gerarAviso,
        });
      }
      resetFormularioEvento();
      setMostrarForm(false);
      onCriado();
    } catch (err: any) {
      setErro(extrairMensagemErro(err, eventoEditandoId ? 'Erro ao atualizar evento.' : 'Erro ao criar evento.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <EnvelopeModal titulo="Eventos da Loja" icone={Calendar} onFechar={onFechar}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{eventos.length} evento(s) registrado(s) por esta Loja.</p>
        <BotaoAlternarForm
          mostrando={mostrarForm}
          onClick={() => {
            if (mostrarForm) resetFormularioEvento();
            setMostrarForm((v) => !v);
          }}
          label="Novo evento"
        />
      </div>

      <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={mostrarEncerrados}
          onChange={(e) => setMostrarEncerrados(e.target.checked)}
          className="w-3.5 h-3.5 accent-[#facc15] bg-[#080808] border-[#333] rounded"
        />
        Mostrar cancelados / encerrados
      </label>

      {/* Erros de excluir/cancelar aparecem aqui mesmo com o formulário fechado
          (a ação de excluir é disparada direto da lista, sem abrir o form). */}
      {erro && !mostrarForm && <p className="text-xs text-red-400">{erro}</p>}

      {mostrarForm && (
        <div className="bg-[#0d0d0d] border border-[#262626] rounded-xl p-4 space-y-3">
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <div>
            <label className={rotuloClasse}>Título</label>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campoClasse} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotuloClasse}>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campoClasse}>
                <option value="">—</option>
                {tiposPermitidos.map((t) => (
                  <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>
                ))}
              </select>
            </div>
            {tipo === 'SESSAO_MAGNA' && tipoInfo?.subtipos_validos && (
              <div>
                <label className={rotuloClasse}>Subtipo</label>
                <select value={subtipo} onChange={(e) => handleSubtipoChange(e.target.value)} className={campoClasse}>
                  <option value="">—</option>
                  {tipoInfo.subtipos_validos.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className={rotuloClasse}>Data</label>
              <CampoData value={dataInicio} onChange={(v) => setDataInicio(v)} className={campoClasse} />
            </div>
            {!diaInteiro && (
              <div>
                <label className={rotuloClasse}>Horário</label>
                <CampoHora value={horaInicio} onChange={handleHoraInicioChange} className={campoClasse} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} /> Dia inteiro
            </label>
          </div>

          {!eventoEditandoId && (
            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="gerar-aviso-minha-loja"
                checked={gerarAviso}
                onChange={(e) => setGerarAviso(e.target.checked)}
                className="w-4 h-4 accent-[#facc15] bg-[#080808] border-[#333] rounded"
              />
              <label htmlFor="gerar-aviso-minha-loja" className="text-xs font-medium text-gray-300 cursor-pointer">
                Publicar também um Aviso de lembrete no Mural
              </label>
            </div>
          )}
          <div>
            <label className={rotuloClasse}>Descrição (opcional)</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={campoClasse} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={handleSalvar}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
              {eventoEditandoId ? 'Salvar edição' : 'Salvar evento'}
            </button>
            {eventoEditandoId && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => { resetFormularioEvento(); setMostrarForm(false); }}
                className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50 py-2.5 px-3 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
      ) : eventosVisiveis.length === 0 ? (
        <p className="text-xs text-gray-500">
          {eventos.length === 0
            ? 'Nenhum evento cadastrado por esta Loja ainda.'
            : 'Nenhum evento vigente. Ative "Mostrar cancelados / encerrados" para ver o histórico.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {eventosVisiveis.map((e: any) => (
            <li key={e.id} className={`text-xs text-gray-300 flex items-start gap-2 bg-[#0d0d0d] border border-[#232323] rounded-xl p-3 ${e.status === 'CANCELADO' ? 'opacity-60' : ''}`}>
              <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-gray-200 block">{e.titulo}</span>
                <span className="text-gray-500">{formatarDataHoraEvento(e.data_inicio)} {e.status ? `• ${e.status}` : ''}</span>
                {e.descricao && <p className="text-gray-400 mt-1">{e.descricao}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(e.status === 'CANCELADO' || e.status === 'REALIZADO') && (
                  <button
                    type="button"
                    title="Clonar evento (nova data)"
                    onClick={() => handleClonarEvento(e)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-[#facc15] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
                {e.status !== 'CANCELADO' && (
                  <>
                    <button
                      type="button"
                      title="Editar evento"
                      onClick={() => handleEditarEvento(e)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-[#facc15] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Cancelar evento"
                      onClick={() => handleExcluirEvento(e.id)}
                      disabled={salvando}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-[#1a1a1a] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        to={`/regiao/${regiaoId}/calendario`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
      >
        Abrir a Agenda completa do Conselho <ChevronRight className="w-3 h-3" />
      </Link>
    </EnvelopeModal>
  );
}

// ---------------------------------------------------------------------
// Modal: Documentos e Convites -- lista completa + upload inline. Mesmo
// endpoint (POST /regional/{id}/documentos/upload, multipart) usado por
// PaginaDocumentos.tsx -- nenhuma rota nova.
// ---------------------------------------------------------------------
function ModalDocumentos({ regiaoId, loja, documentos, carregando, onFechar, onCriado }: {
  regiaoId: string | undefined; loja: any; documentos: any[]; carregando: boolean;
  onFechar: () => void; onCriado: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('CIRCULAR');
  const [dataDocumento, setDataDocumento] = useState(new Date().toISOString().split('T')[0]);
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Expiração automática (2026-09-22, a pedido do usuário): checkbox + data --
  // se marcado e a data preenchida, o agendador do backend arquiva sozinho o
  // documento/convite assim que a data passa (mesmo mecanismo de Avisos).
  const [temExpiracao, setTemExpiracao] = useState(false);
  const [dataExpiracao, setDataExpiracao] = useState('');
  // Toggle para ver também os arquivados (manual ou por expiração), default OFF --
  // mesmo padrão já usado no card de Eventos.
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const documentosVisiveis = mostrarArquivados
    ? documentos
    : documentos.filter((d: any) => !d.arquivado);

  const handleSalvar = async () => {
    if (!titulo.trim() || !arquivo) {
      setErro('Preencha o título e selecione um arquivo para anexar.');
      return;
    }
    if (temExpiracao && !dataExpiracao) {
      setErro('Informe a data de expiração ou desmarque a opção.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const data = new FormData();
      data.append('titulo', titulo.trim());
      data.append('categoria', categoria);
      data.append('tipo_origem', 'LOJA');
      data.append('loja_emissora_id', String(loja.loja_id));
      data.append('loja_emissora_nome', loja.nome || '');
      data.append('loja_emissora_numero', loja.numero || '');
      if (descricao.trim()) data.append('descricao_ementa', descricao.trim());
      if (dataDocumento) data.append('data_documento', dataDocumento);
      if (temExpiracao && dataExpiracao) data.append('data_expiracao', dataExpiracao);
      data.append('visibilidade', 'PUBLICO_CONSELHO');
      data.append('arquivo', arquivo);

      await clienteHttp.post(`${API_URL}/regional/${regiaoId}/documentos/upload`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTitulo(''); setDescricao(''); setArquivo(null); setTemExpiracao(false); setDataExpiracao('');
      setMostrarForm(false);
      onCriado();
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Erro ao publicar documento.'));
    } finally {
      setSalvando(false);
    }
  };

  const handleReativarDocumento = async (docId: string) => {
    setSalvando(true);
    setErro('');
    try {
      await clienteHttp.put(`${API_URL}/regional/${regiaoId}/documentos/${docId}/reativar`);
      onCriado();
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Erro ao reativar documento.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <EnvelopeModal titulo="Documentos e Convites da Loja" icone={FileText} onFechar={onFechar}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{documentos.length} documento(s) publicado(s) por esta Loja.</p>
        <BotaoAlternarForm mostrando={mostrarForm} onClick={() => setMostrarForm((v) => !v)} label="Novo documento" />
      </div>

      <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={mostrarArquivados}
          onChange={(e) => setMostrarArquivados(e.target.checked)}
          className="w-3.5 h-3.5 accent-[#facc15] bg-[#080808] border-[#333] rounded"
        />
        Mostrar arquivados
      </label>

      {mostrarForm && (
        <div className="bg-[#0d0d0d] border border-[#262626] rounded-xl p-4 space-y-3">
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <div>
            <label className={rotuloClasse}>Título</label>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campoClasse} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotuloClasse}>Categoria</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campoClasse}>
                <option value="ATA">Ata de Sessão</option>
                <option value="CIRCULAR">Prancha Circular</option>
                <option value="CONVITE">Prancha Convite</option>
                <option value="MODELO">Modelo Padrão</option>
              </select>
            </div>
            <div>
              <label className={rotuloClasse}>Data do documento</label>
              <CampoData value={dataDocumento} onChange={(v) => setDataDocumento(v)} className={campoClasse} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tem-expiracao-doc-minha-loja"
              checked={temExpiracao}
              onChange={(e) => { setTemExpiracao(e.target.checked); if (!e.target.checked) setDataExpiracao(''); }}
              className="w-4 h-4 accent-[#facc15] bg-[#080808] border-[#333] rounded"
            />
            <label htmlFor="tem-expiracao-doc-minha-loja" className="text-xs font-medium text-gray-300 cursor-pointer">
              Expira automaticamente numa data
            </label>
          </div>
          {temExpiracao && (
            <div>
              <label className={rotuloClasse}>Data de expiração</label>
              <CampoData value={dataExpiracao} onChange={(v) => setDataExpiracao(v)} className={campoClasse} min={new Date().toISOString().split('T')[0]} />
              <p className="text-[11px] text-gray-500 mt-1">Depois dessa data, o sistema arquiva este documento/convite automaticamente.</p>
            </div>
          )}
          <div>
            <label className={rotuloClasse}>Descrição / ementa (opcional)</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={campoClasse} />
          </div>
          <div>
            <label className={rotuloClasse}>Arquivo (PDF)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              className="w-full text-xs text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#facc15] file:text-black hover:file:bg-[#eab308] cursor-pointer"
            />
          </div>
          <button
            type="button"
            disabled={salvando}
            onClick={handleSalvar}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Publicar documento
          </button>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
      ) : documentosVisiveis.length === 0 ? (
        <p className="text-xs text-gray-500">
          {documentos.length === 0
            ? 'Nenhum documento publicado por esta Loja ainda.'
            : 'Nenhum documento vigente. Ative "Mostrar arquivados" para ver o histórico.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {documentosVisiveis.map((d: any) => (
            <li key={d.id} className={`text-xs text-gray-300 flex items-start gap-2 bg-[#0d0d0d] border border-[#232323] rounded-xl p-3 ${d.arquivado ? 'opacity-60' : ''}`}>
              <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-gray-200 block">{d.titulo}</span>
                <span className="text-gray-500">
                  {d.categoria === 'CONVITE' ? 'Convite' : d.categoria} • {d.data_documento}
                  {d.data_expiracao && ` • Expira ${formatarDataBR(d.data_expiracao)}`}
                  {d.arquivado && ' • Arquivado'}
                </span>
                {d.descricao_ementa && <p className="text-gray-400 mt-1">{d.descricao_ementa}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {d.arquivado && (
                  <button
                    type="button"
                    title="Reativar documento"
                    onClick={() => handleReativarDocumento(d.id)}
                    disabled={salvando}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-[#facc15] hover:bg-[#1a1a1a] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                {d.tem_arquivo && (
                  <a
                    href={`${API_URL}/regional/${regiaoId}/documentos/${d.id}/arquivo`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#facc15] hover:text-[#eab308]"
                    title="Baixar arquivo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        to={`/regiao/${regiaoId}/documentos`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
      >
        Abrir os Documentos completos do Conselho <ChevronRight className="w-3 h-3" />
      </Link>
    </EnvelopeModal>
  );
}

// ---------------------------------------------------------------------
// Modal: Editais de Admissão (Prévias) -- lista completa + criação inline
// (com upload opcional de PDF). Mesmos endpoints (POST
// /regional/{id}/admissoes ou /admissoes/upload) usados por
// PaginaAdmissoes.tsx -- nenhuma rota nova.
// ---------------------------------------------------------------------
function ModalAdmissoes({ regiaoId, loja, previas, carregando, onFechar, onCriado }: {
  regiaoId: string | undefined; loja: any; previas: any[]; carregando: boolean;
  onFechar: () => void; onCriado: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('INICIACAO');
  const [candidatoNome, setCandidatoNome] = useState('');
  const [dataLimite, setDataLimite] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);

  const handleSalvar = async () => {
    if (!candidatoNome.trim()) {
      setErro('Informe o nome do candidato.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (arquivo) {
        const data = new FormData();
        data.append('tipo', tipo);
        data.append('loja_id', String(loja.loja_id));
        data.append('loja_nome', loja.nome || '');
        data.append('loja_numero', loja.numero || '');
        data.append('candidato_nome', candidatoNome.trim());
        if (dataLimite) data.append('data_limite', dataLimite);
        data.append('arquivo', arquivo);
        await clienteHttp.post(`${API_URL}/regional/${regiaoId}/admissoes/upload`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await clienteHttp.post(`${API_URL}/regional/${regiaoId}/admissoes`, {
          tipo,
          loja_id: loja.loja_id,
          loja_nome: loja.nome || '',
          loja_numero: loja.numero || '',
          candidato_nome: candidatoNome.trim(),
          data_limite: dataLimite || null,
        });
      }
      setCandidatoNome(''); setDataLimite(''); setArquivo(null);
      setMostrarForm(false);
      onCriado();
    } catch (err: any) {
      setErro(extrairMensagemErro(err, 'Erro ao publicar edital de admissão.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <EnvelopeModal titulo="Editais de Admissão da Loja" icone={BookOpenCheck} onFechar={onFechar}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{previas.length} edital(is) postado(s) por esta Loja.</p>
        <BotaoAlternarForm mostrando={mostrarForm} onClick={() => setMostrarForm((v) => !v)} label="Novo edital" />
      </div>

      {mostrarForm && (
        <div className="bg-[#0d0d0d] border border-[#262626] rounded-xl p-4 space-y-3">
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotuloClasse}>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campoClasse}>
                <option value="INICIACAO">Iniciação</option>
                <option value="FILIACAO">Filiação</option>
                <option value="REGULARIZACAO">Regularização</option>
              </select>
            </div>
            <div>
              <label className={rotuloClasse}>Prazo para considerações (opcional)</label>
              <CampoData value={dataLimite} onChange={(v) => setDataLimite(v)} className={campoClasse} />
            </div>
          </div>
          <div>
            <label className={rotuloClasse}>Nome do candidato</label>
            <input type="text" value={candidatoNome} onChange={(e) => setCandidatoNome(e.target.value)} className={campoClasse} />
          </div>
          <div>
            <label className={rotuloClasse}>Edital em PDF (opcional)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              className="w-full text-xs text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#facc15] file:text-black hover:file:bg-[#eab308] cursor-pointer"
            />
          </div>
          <button
            type="button"
            disabled={salvando}
            onClick={handleSalvar}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Publicar edital
          </button>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-gray-500 text-xs py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
      ) : previas.length === 0 ? (
        <p className="text-xs text-gray-500">Nenhum edital de admissão postado por esta Loja ainda.</p>
      ) : (
        <ul className="space-y-2">
          {previas.map((p: any) => (
            <li key={p.id} className="text-xs text-gray-300 flex items-center justify-between gap-2 bg-[#0d0d0d] border border-[#232323] rounded-xl p-3">
              <div className="min-w-0 flex items-start gap-2">
                <BookOpenCheck className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-semibold text-gray-200 truncate block">
                    {p.candidato_nome} — {p.tipo_label}
                  </span>
                  <span className="text-gray-500">Postado em {formatarDataBR(p.data_postagem)}</span>
                </div>
              </div>
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                  p.status === 'CONCLUIDO'
                    ? 'bg-green-500/15 text-green-300 border-green-500/30'
                    : p.status === 'AVERIGUADO'
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {p.status === 'EM_ANDAMENTO' ? 'Em andamento' : p.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        to={`/regiao/${regiaoId}/admissoes`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
      >
        Abrir o Mural de Admissão completo <ChevronRight className="w-3 h-3" />
      </Link>
    </EnvelopeModal>
  );
}
