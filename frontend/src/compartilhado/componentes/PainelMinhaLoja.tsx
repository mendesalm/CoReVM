// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { clienteHttp } from '../contextos/AuthContext';
import {
  Building2, Award, Users, AlertTriangle, CheckCircle2, Edit3,
  UserCog, Zap, ArrowLeft, Loader2, Clock, Mail, Phone, IdCard,
  Calendar, FileText, BookOpenCheck, ChevronRight
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
  // o cadastro da Loja, mas NÃO pode tomar decisões políticas (empossar/
  // trocar VM, designar Suplente do Conselho, transmissão emergencial).
  // Essas ações continuam exclusivas de VM/Diretoria no backend
  // (`_exigir_vm_da_loja_ou_diretoria`) — escondidas aqui pra não oferecer
  // um botão que sempre daria 403 para este perfil.
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
  // resumos compactos (contagem + poucos itens mais recentes) das 3 áreas
  // que já guardam o vínculo com a Loja no backend -- nenhuma rota nova foi
  // necessária. Cada widget tem um link "ver tudo" para a tela completa do
  // módulo (Agenda/Documentos/Admissões), já que o painel é um resumo, não
  // uma substituição dessas telas.
  const [eventos, setEventos] = useState<any[]>([]);
  const [carregandoEventos, setCarregandoEventos] = useState(false);
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(false);
  const [previas, setPrevias] = useState<any[]>([]);
  const [carregandoPrevias, setCarregandoPrevias] = useState(false);

  useEffect(() => {
    if (!loja?.loja_id || !regiaoId) {
      setEventos([]);
      return;
    }
    setCarregandoEventos(true);
    // GET /agenda/eventos já aceita ?loja_id= como filtro -- nenhuma rota
    // nova precisou ser criada para este widget.
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/agenda/eventos`, { params: { loja_id: loja.loja_id } })
      .then((res) => setEventos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEventos([]))
      .finally(() => setCarregandoEventos(false));
  }, [loja?.loja_id, regiaoId]);

  useEffect(() => {
    if (!loja?.loja_id || !regiaoId) {
      setDocumentos([]);
      return;
    }
    setCarregandoDocumentos(true);
    // GET /documentos não filtra por loja na query -- filtramos no cliente
    // pelo `loja_emissora_id`, que já vem em cada registro (documentos e
    // convites vivem na mesma tabela, distinguidos por `categoria`).
    clienteHttp.get(`${API_URL}/regional/${regiaoId}/documentos`)
      .then((res) => {
        const todos = Array.isArray(res.data) ? res.data : [];
        setDocumentos(todos.filter((d: any) => String(d.loja_emissora_id) === String(loja.loja_id)));
      })
      .catch(() => setDocumentos([]))
      .finally(() => setCarregandoDocumentos(false));
  }, [loja?.loja_id, regiaoId]);

  useEffect(() => {
    if (!loja?.loja_id || !regiaoId) {
      setPrevias([]);
      return;
    }
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
  }, [loja?.loja_id, regiaoId]);

  if (!loja) {
    return (
      <div className="max-w-5xl mx-auto p-6">
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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

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
              Painel exclusivo do Venerável Mestre — dados e ações da sua própria Loja
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Cartão: Dados Cadastrais da Loja */}
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

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="block text-gray-500 mb-1">Potência</span>
              <span className="font-semibold text-gray-200">{loja.potencia || 'GOB'}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Rito Trabalhado</span>
              <span className="font-semibold text-gray-200">{loja.rito || 'REAA'}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Oriente</span>
              <span className="font-semibold text-gray-200">{loja.cidade || 'Não definido'}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Número</span>
              <span className="font-semibold text-gray-200">{loja.numero || '—'}</span>
            </div>
          </div>
        </div>

        {/* Cartão: Venerável Mestre e duração do mandato */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-4">
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

        {/* Cartão: Suplente do Conselho */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-4 lg:col-span-2">
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
            <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
              <Users className="w-4 h-4 shrink-0" />
              <span>{loja.suplente_nome}</span>
              {loja.suplente_pode_indicar_veneravel && !temVm && (
                <span
                  className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-orange-500/15 text-orange-300 border border-orange-500/30"
                  title="Mestre Instalado imediato — pode indicar o próximo VM (poder de uso único)"
                >
                  Mestre Instalado imediato
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Nenhum Suplente do Conselho designado ainda para esta Loja.</p>
          )}
        </div>

        {/* Cartão: Próximos Eventos da Loja -- resumo compacto, GET
            /agenda/eventos?loja_id= já existente, sem rota nova. */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Calendar className="w-4 h-4 text-[#facc15]" /> Eventos da Loja
            </div>
            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0d0d] border border-[#262626] px-2 py-0.5 rounded-full">
              {eventos.length}
            </span>
          </div>

          {carregandoEventos ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : eventos.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum evento cadastrado por esta Loja ainda.</p>
          ) : (
            <ul className="space-y-2">
              {eventos.slice(0, 3).map((e: any) => (
                <li key={e.id} className="text-xs text-gray-300 flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-200 truncate block">{e.titulo}</span>
                    <span className="text-gray-500">{formatarDataBR(e.data_inicio)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            to={`/regiao/${regiaoId}/calendario`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors"
          >
            Ver agenda completa <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Cartão: Documentos e Convites da Loja -- resumo compacto, GET
            /documentos existente, filtrado no cliente por loja_emissora_id. */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <FileText className="w-4 h-4 text-[#facc15]" /> Documentos e Convites
            </div>
            <span className="text-[11px] font-bold text-gray-400 bg-[#0d0d0d] border border-[#262626] px-2 py-0.5 rounded-full">
              {documentos.length}
            </span>
          </div>

          {carregandoDocumentos ? (
            <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : documentos.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum documento publicado por esta Loja ainda.</p>
          ) : (
            <ul className="space-y-2">
              {documentos.slice(0, 3).map((d: any) => (
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

          <Link
            to={`/regiao/${regiaoId}/documentos`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors"
          >
            Ver documentos completos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Cartão: Editais de Admissão (Mural de Admissão) -- resumo
            compacto, GET /admissoes existente, filtrado no cliente por
            loja_id (a rota devolve as prévias de todas as Lojas por
            desenho, para o parecer entre Lojas funcionar). */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-5 space-y-3 lg:col-span-2">
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

          <Link
            to={`/regiao/${regiaoId}/admissoes`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#facc15] hover:text-[#eab308] transition-colors"
          >
            Ver mural de admissão completo <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

      </div>
    </div>
  );
}
