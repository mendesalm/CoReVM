// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck, Loader2, Award, Calendar,
  Bell, Pin, Archive, ArchiveRestore, Plus, AlertTriangle, AlertOctagon,
  Sparkles, Megaphone, CheckCheck, Eye
} from 'lucide-react';
import { clienteHttp } from '../../compartilhado/contextos/AuthContext';

const API_URL = 'http://localhost:8003/api/v1';

// CORREÇÃO (2026-09-12): normaliza o `detail` de erro do FastAPI, que pode
// vir como string simples ou como lista de objetos de validação do Pydantic
// ({type, loc, msg, input}) — renderizar essa lista direto no JSX quebra o
// React ("Objects are not valid as a React child"). Mesmo bug/correção já
// aplicados em PaginaLojas.tsx (seção 9.11 do histórico do projeto); este
// arquivo havia ficado de fora daquela correção.
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

// ALTERAÇÃO (2026-09-19, redesign "quadro de avisos real"): o mural passa a
// ser um quadro de miniaturas clicáveis (post-it para Notificações, "folha
// de documento" com canto dobrado para Avisos), coloridas pelo nível de
// urgência, que abrem um modal com o card completo ao serem clicadas. Isso
// substitui o carrossel de rolagem automática (item B.7 original) — o
// problema que motivou a troca era que 3+ itens fixados escondiam o resto
// do mural; com miniaturas, todo o conteúdo cabe visível ao mesmo tempo,
// fixados primeiro, sem exigir rolagem automática nem área reservada.
// ALTERAÇÃO (2026-09-19, ajuste de feedback): cada nível ganha também um
// ícone (não só cor), reaproveitando os mesmos ícones já usados nos cards
// completos de Notificação (AlertOctagon/AlertTriangle/Sparkles) — agora
// aplicados de forma uniforme às miniaturas de Avisos e Notificações, para
// que a classificação por urgência não dependa só da cor da borda.
function corNivel(nivel: string) {
  if (nivel === 'ALTO') {
    return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-300', dot: 'bg-red-400', icone: AlertOctagon, chave: 'alto' };
  }
  if (nivel === 'MEDIO') {
    return { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-300', dot: 'bg-amber-400', icone: AlertTriangle, chave: 'medio' };
  }
  return { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-300', dot: 'bg-green-400', icone: Sparkles, chave: 'baixo' };
}

// Rotação leve e estável (não recalcula a cada render) para dar o efeito
// visual de post-it "colado à mão" — baseada num hash simples do id, não em
// Math.random(), para o item não "tremer" de posição a cada nova renderização.
function rotacaoEstavel(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 7) - 3; // intervalo: -3deg a 3deg
}

export default function PainelConselho() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Controle de Usuário e RBAC
  // CORREÇÃO (2026-09-12): removido o `activeUserId`/'CIM_12345_PRESIDENTE'
  // fixo e o header X-User-Id (ver fetchDashboard/handleCriarAviso/
  // handleExcluirAviso abaixo) — o backend não reconhece mais esse header
  // desde a seção 9.5 do histórico (exige Authorization: Bearer real via
  // e-Sigma). O contexto nasce neutro e é populado pela resposta real de
  // GET /regional/{id}/me.
  const [userContext, setUserContext] = useState<any>({
    usuario_id: null,
    role: null,
    is_diretoria: false,
    loja_id: null
  });

  // Mural de Avisos e Notificações
  const [avisos, setAvisos] = useState<any[]>([]);
  const [showNovoAvisoModal, setShowNovoAvisoModal] = useState(false);
  const [salvandoAviso, setSalvandoAviso] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // ALTERAÇÃO (2026-09-12): toggle "ver arquivados", exclusivo Diretoria/
  // SuperAdmin — permite reativar um item arquivado manual ou automaticamente.
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [avisoForm, setAvisoForm] = useState({
    titulo: '',
    conteudo: '',
    tipo: 'AVISO',
    nivel: 'BAIXO',
    data_validade: '',
    fixado: false
  });

  // ALTERAÇÃO (2026-09-19): id do item em foco no modal de detalhe do quadro
  // de miniaturas. Guarda-se apenas o id (não uma cópia do item) para que o
  // modal sempre reflita o estado mais atual — por exemplo, se o usuário
  // marcar como lido dentro do modal, o card exibido já atualiza o badge
  // "LIDO"/desafixado sem precisar fechar e reabrir.
  const [itemEmFocoId, setItemEmFocoId] = useState<string | null>(null);

  // Carregar dados e avisos
  // CORREÇÃO (2026-09-14): as duas chamadas não dependem uma da outra —
  // antes eram sequenciais (`await` uma depois da outra), o que somava o
  // tempo das duas + a validação remota do token no e-Sigma (repetida em
  // cada requisição) e contribuía para o delay de 3-5s observado nos
  // primeiros testes. Disparando em paralelo com `Promise.all`, o tempo
  // total passa a ser o da mais lenta das duas, não a soma.
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [userRes, resAvisos] = await Promise.all([
        // 1. Contexto do usuário logado (RBAC) — via clienteHttp, que já
        // injeta Authorization: Bearer <token> (ver AuthContext.tsx).
        clienteHttp.get(`${API_URL}/regional/${id}/me`),
        // 2. Avisos da Região
        clienteHttp.get(`${API_URL}/regional/${id}/avisos?incluir_arquivados=${mostrarArquivados}`)
      ]);
      setUserContext(userRes.data);
      setAvisos(resAvisos.data || []);
    } catch (err: any) {
      setErro(extrairMensagemErro(err, "Acesso negado ao painel regional."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDashboard();
  }, [id, reloadKey, mostrarArquivados]);

  // Marcar como lido (tag "lido") — chamada explícita ao clicar na tag.
  const handleMarcarLido = async (avisoId: string) => {
    try {
      await clienteHttp.post(`${API_URL}/regional/${id}/avisos/${avisoId}/marcar-lido`);
      // ALTERAÇÃO (2026-09-19): marcar como lido também desafixa o item
      // (a pedido do usuário) — espelha no estado local a mesma regra já
      // aplicada no backend. Atualização (mesmo dia, a pedido do usuário):
      // a exceção que mantinha itens de nível ALTO (urgência) sempre
      // fixados mesmo após lidos foi removida — agora TODO item desafixa
      // ao ser lido, sem exceção de nível.
      setAvisos(prev => prev.map(a => a.id === avisoId
        ? { ...a, lido: true, fixado: false }
        : a
      ));
    } catch (err: any) {
      // Silencioso: marcar como lido não deve interromper a leitura do usuário.
    }
  };

  // Reativar (desarquivar) — exclusivo Diretoria/SuperAdmin.
  const handleReativarAviso = async (avisoId: string) => {
    try {
      const res = await clienteHttp.put(`${API_URL}/regional/${id}/avisos/${avisoId}/reativar`);
      alert(res.data?.message || 'Item reativado com sucesso.');
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao reativar item'));
    }
  };

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
      await clienteHttp.post(`${API_URL}/regional/${id}/avisos`, {
        ...avisoForm,
        data_validade: avisoForm.data_validade || null
      });
      alert(`${avisoForm.tipo === 'NOTIFICACAO' ? 'Notificação' : 'Aviso'} publicado com sucesso no mural do conselho!`);
      setShowNovoAvisoModal(false);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao publicar aviso'));
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
      if (!window.confirm('Tem certeza que deseja arquivar este item do mural? A Diretoria poderá reativá-lo depois, se necessário.')) return;
    }

    try {
      const res = await clienteHttp.delete(`${API_URL}/regional/${id}/avisos/${avisoId}?hard_delete=${hardDelete}`);
      alert(res.data?.message || 'Item processado com sucesso.');
      setReloadKey(k => k + 1);
    } catch (err: any) {
      alert(extrairMensagemErro(err, 'Erro ao remover item'));
    }
  };

  // ALTERAÇÃO (2026-09-19): cards extraídos em funções de render para serem
  // reutilizados tanto na área fixa (sempre visível) quanto no carrossel
  // (lista original + cópia duplicada usada para o loop contínuo) e na
  // lista estática de fallback (arquivados / prefers-reduced-motion), sem
  // triplicar o JSX. `keySuffix` garante keys únicas quando o mesmo item
  // aparece mais de uma vez na árvore (cópia "espelho" do carrossel).
  const renderAvisoCard = (a: any, keySuffix: string = '') => {
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
        key={`${a.id}${keySuffix}`}
        aria-hidden={keySuffix ? true : undefined}
        className={`p-4 sm:p-5 rounded-2xl transition-all ${borderClass} ${
          a.arquivado
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
              {/* ALTERAÇÃO (2026-09-12): urgência (ALTO) já é
                  fixada automaticamente e exibida em destaque —
                  mostrar também a tag "FIXADO" seria redundante,
                  então ela só aparece para MEDIO/BAIXO fixados. */}
              {a.fixado && !isUrgente && (
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

              {a.arquivado && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                  ARQUIVADO
                </span>
              )}

              {/* Tag "lido" — clicável quando ainda não lido. */}
              {a.lido ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCheck className="w-3 h-3" /> LIDO
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMarcarLido(a.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#1e1e1e] text-gray-400 border border-[#333] hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
                  title="Marcar como lido"
                >
                  <Eye className="w-3 h-3" /> NÃO LIDO
                </button>
              )}

              <h3 className="text-sm sm:text-base font-bold text-white ml-0.5">{a.titulo}</h3>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line pt-0.5">
              {a.conteudo}
            </p>

            {/* Log de arquivamento (pedido do usuário). */}
            {a.arquivado && a.arquivado_em && (
              <p className="text-[10px] text-red-300/80 font-medium pt-0.5">
                Arquivado em {a.arquivado_em.split('T')[0].split('-').reverse().join('/')} por {a.arquivado_por || 'Sistema'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Botão Reativar — só quando arquivado e o usuário pode reativar. */}
            {a.arquivado && a.pode_reativar && (
              <button
                type="button"
                onClick={() => handleReativarAviso(a.id)}
                className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors cursor-pointer"
                title="Reativar (desarquivar)"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Botão Arquivar */}
            {a.pode_excluir && !a.arquivado && (
              <button
                type="button"
                onClick={() => handleExcluirAviso(a.id)}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                title={userContext.role?.toUpperCase() === 'SUPERADMIN' ? "Opção de Arquivamento ou Hard Delete" : "Arquivar aviso"}
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3.5 pt-2.5 border-t border-[#262626] flex items-center justify-between text-[11px] text-gray-400 flex-wrap gap-2">
          <span className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-[#facc15]" />
            <span className="text-gray-300 font-medium">{a.autor_nome || 'Conselho'}</span>
            {a.loja_id && <span className="text-[#facc15]/90 font-medium">(Loja {a.loja_numero || a.loja_id})</span>}
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
  };

  const renderNotificacaoCard = (n: any, keySuffix: string = '') => {
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
        key={`${n.id}${keySuffix}`}
        aria-hidden={keySuffix ? true : undefined}
        className={`p-4 rounded-xl border border-[#242730] hover:border-[#353a47] transition-all flex gap-3.5 items-start ${
          n.arquivado
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
              {n.arquivado && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                  ARQUIVADO
                </span>
              )}
              {n.lido ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCheck className="w-3 h-3" /> LIDO
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMarcarLido(n.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#1e1e1e] text-gray-400 border border-[#333] hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
                  title="Marcar como lido"
                >
                  <Eye className="w-3 h-3" /> NÃO LIDO
                </button>
              )}
              <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[220px] sm:max-w-[280px]">
                {n.titulo}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {n.arquivado && n.pode_reativar && (
                <button
                  type="button"
                  onClick={() => handleReativarAviso(n.id)}
                  className="p-1 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Reativar (desarquivar)"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                </button>
              )}
              {n.pode_excluir && !n.arquivado && (
                <button
                  type="button"
                  onClick={() => handleExcluirAviso(n.id)}
                  className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Arquivar notificação"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed mt-1.5 whitespace-pre-line">
            {n.conteudo}
          </p>

          {n.arquivado && n.arquivado_em && (
            <p className="text-[10px] text-red-300/80 font-medium mt-1">
              Arquivado em {n.arquivado_em.split('T')[0].split('-').reverse().join('/')} por {n.arquivado_por || 'Sistema'}
            </p>
          )}

          <div className="mt-2.5 pt-2 border-t border-[#1c1e26] flex items-center justify-between text-[10px] text-gray-500 flex-wrap gap-2">
            <span>
              Por: <strong className="text-gray-300">{n.autor_nome || 'Conselho'}</strong>
              {n.loja_id && <span className="text-[#facc15]/80 ml-1">(Loja {n.loja_numero || n.loja_id})</span>}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {n.data_publicacao ? n.data_publicacao.split('-').reverse().join('/') : ''}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ALTERAÇÃO (2026-09-19, ajuste de feedback): pino de "fixado" agora com
  // visual único e consistente entre os dois formatos de miniatura (badge
  // circular amarelo no canto superior direito) — antes cada tipo tinha uma
  // posição/estilo diferente. A rotação de base (efeito "colado à mão") é
  // guardada numa CSS custom property (`--rot`) em vez de direto na
  // propriedade `transform` inline — assim a classe Tailwind arbitrária de
  // hover (que também mexe em `transform`) consegue somar uma rotação extra
  // sem que o `style` inline sobreponha a regra de `:hover` (inline sempre
  // vence classe, mesmo com pseudo-classe, então a rotação base precisa
  // "viver" numa variável, não na propriedade final).
  const renderNotificacaoMini = (n: any) => {
    const cor = corNivel(n.nivel);
    const IconeNivel = cor.icone;
    const rot = rotacaoEstavel(n.id);
    // ALTERAÇÃO (2026-09-19, pedido do usuário): "post-it mais realista" —
    // o canto inferior direito é recortado (clip-path) para expor, por
    // baixo, uma pequena dobra em SVG com gradiente + sombra (defs globais
    // no topo do componente), simulando o canto do papel se curvando pra
    // cima, como um post-it de verdade.
    return (
      <button
        key={n.id}
        type="button"
        onClick={() => setItemEmFocoId(n.id)}
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 11px), calc(100% - 11px) 100%, 0 100%)',
          ['--rot' as any]: `${rot}deg`
        }}
        className={`relative text-left p-3 pt-4 border ${cor.border} ${cor.bg} shadow-md [contain:layout] [transform-origin:center] [transform:rotate(var(--rot))] hover:[transform:rotate(calc(var(--rot)_+_6deg))_scale(1.08)] focus:[transform:rotate(calc(var(--rot)_+_6deg))_scale(1.08)] transition-transform duration-200 hover:shadow-xl hover:z-10 focus:shadow-xl focus:z-10 cursor-pointer ${n.lido ? 'opacity-50 saturate-[0.5]' : ''}`}
      >
        {/* Dobra do post-it (canto inferior direito) */}
        <svg
          className="absolute bottom-0 right-0 w-[15px] h-[15px] pointer-events-none"
          viewBox="0 0 15 15"
          aria-hidden="true"
        >
          <path d="M 15 15 L 15 3.5 L 3.5 15 Z" fill={`url(#crvm-dogear-${cor.chave})`} filter="url(#crvm-dogear-sombra)" />
          <line x1="15" y1="3.5" x2="3.5" y2="15" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
        </svg>
        {n.fixado && (
          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#facc15] flex items-center justify-center shadow-lg border border-black/10">
            <Pin className="w-3.5 h-3.5 text-black" />
          </span>
        )}
        <div className="flex items-center gap-1 mb-1">
          <IconeNivel className={`w-3 h-3 shrink-0 ${cor.text}`} />
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/80 flex-1" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {n.titulo}
          </p>
        </div>
        <p className="text-[10px] text-white/70 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {n.conteudo}
        </p>
      </button>
    );
  };

  // ALTERAÇÃO (2026-09-19, ajuste de feedback): miniatura de Aviso ganhou a
  // mesma rotação leve "colada à mão" das Notificações (antes só o post-it
  // tinha), o mesmo pino de fixado padronizado, e o ícone de nível
  // (AlertOctagon/AlertTriangle/Sparkles) ao lado do título — mantendo o
  // formato "folha de documento" com o canto superior direito dobrado.
  const renderAvisoMini = (a: any) => {
    const cor = corNivel(a.nivel);
    const IconeNivel = cor.icone;
    const rot = rotacaoEstavel(a.id);
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => setItemEmFocoId(a.id)}
        style={{
          clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)',
          ['--rot' as any]: `${rot}deg`
        }}
        className={`relative text-left p-3 pt-4 border ${cor.border} bg-[#161616] shadow-md [contain:layout] [transform-origin:center] [transform:rotate(var(--rot))] hover:[transform:rotate(calc(var(--rot)_+_6deg))_scale(1.08)] focus:[transform:rotate(calc(var(--rot)_+_6deg))_scale(1.08)] transition-transform duration-200 hover:shadow-xl hover:z-10 focus:shadow-xl focus:z-10 cursor-pointer ${a.lido ? 'opacity-50 saturate-[0.5]' : ''}`}
      >
        {/* ALTERAÇÃO (2026-09-19, pedido do usuário): dobra do "documento"
            (canto superior direito) trocada de um triângulo de cor plana
            para o mesmo SVG com gradiente + sombra usado no post-it — mais
            realista, simula o canto do papel dobrado pra dentro. */}
        <svg
          className="absolute top-0 right-0 w-[15px] h-[15px] pointer-events-none"
          viewBox="0 0 15 15"
          aria-hidden="true"
        >
          <path d="M 0 0 L 15 0 L 15 15 Z" fill={`url(#crvm-dogear-${cor.chave})`} filter="url(#crvm-dogear-sombra)" />
          <line x1="0" y1="0" x2="15" y2="15" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
        </svg>
        {/* Pino de fixado no canto oposto ao da dobra do "documento", para
            não sobrepor a decoração de canto dobrado. */}
        {a.fixado && (
          <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#facc15] flex items-center justify-center shadow-lg border border-black/10">
            <Pin className="w-3.5 h-3.5 text-black" />
          </span>
        )}
        <div className="flex items-center gap-1 mb-1">
          <IconeNivel className={`w-3 h-3 shrink-0 ${cor.text}`} />
          <p className={`text-[10px] font-bold uppercase tracking-wide ${cor.text} flex-1`} style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.titulo}
          </p>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {a.conteudo}
        </p>
      </button>
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

  // Separação em duas colunas: Avisos (Esquerda) e Notificações (Direita)
  const itensAvisos = avisos.filter((a: any) => a.tipo !== 'NOTIFICACAO');
  const itensNotificacoes = avisos.filter((a: any) => a.tipo === 'NOTIFICACAO');

  // ALTERAÇÃO (2026-09-19): quadro de miniaturas — fixados aparecem primeiro
  // em cada coluna (mesma ordem de prioridade do design anterior), seguidos
  // pelo restante; todos os itens ficam visíveis ao mesmo tempo, sem exigir
  // rolagem automática nem área reservada só para os fixados.
  const avisosOrdenados = [
    ...itensAvisos.filter((a: any) => a.fixado),
    ...itensAvisos.filter((a: any) => !a.fixado)
  ];
  const notifOrdenadas = [
    ...itensNotificacoes.filter((n: any) => n.fixado),
    ...itensNotificacoes.filter((n: any) => !n.fixado)
  ];
  const itemEmFoco = itemEmFocoId ? avisos.find((a: any) => a.id === itemEmFocoId) : null;

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200 p-6 sm:p-8">

      {/* ALTERAÇÃO (2026-09-19, pedido do usuário): defs SVG globais (invisíveis,
          0x0px) para a "dobra" realista das miniaturas de post-it/documento —
          gradiente por nível (mesma cor da borda, mas com sombreado simulando
          o papel curvando) + um filtro de sombra suave por baixo da dobra.
          Um único bloco de defs, referenciado por todas as miniaturas via
          `url(#crvm-dogear-<nivel>)`/`url(#crvm-dogear-sombra)` — SVG permite
          referenciar defs de qualquer lugar do mesmo documento, não precisa
          duplicar em cada card. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="crvm-dogear-baixo" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="55%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <linearGradient id="crvm-dogear-medio" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="crvm-dogear-alto" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="55%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <filter id="crvm-dogear-sombra" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.55" />
          </filter>
        </defs>
      </svg>

      {/* Container Principal: Grid de 2 Colunas (Avisos à esquerda, Notificações à direita) */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ALTERAÇÃO (2026-09-12): toggle "ver arquivados" — só Diretoria/
            SuperAdmin, que são os únicos com permissão de reativar. */}
        {(userContext.is_diretoria || userContext.role?.toUpperCase() === 'SUPERADMIN') && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setMostrarArquivados(v => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer border ${
                mostrarArquivados
                  ? 'bg-[#facc15]/20 text-[#facc15] border-[#facc15]/40'
                  : 'bg-[#181818] text-gray-400 border-[#333] hover:text-white'
              }`}
            >
              {mostrarArquivados ? <Eye className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {mostrarArquivados ? 'Ocultar arquivados' : 'Ver arquivados'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ======================================================== */}
          {/* COLUNA 1: AVISOS (COM BORDAS CONFORME O NÍVEL: VERDE, AMARELO, VERMELHO) */}
          {/* ======================================================== */}
          <div
            className="bg-[#121212] border border-[#222] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col"
            style={{ height: 'calc(100vh - 200px)' }}
          >

            {/* Cabeçalho da Coluna de Avisos */}
            <div className="flex items-center justify-between pb-4 border-b border-[#222] gap-3 shrink-0">
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

            {/* Corpo: quadro de miniaturas clicáveis (fixados primeiro) —
                ALTERAÇÃO (2026-09-19): a coluna inteira agora ocupa a altura
                disponível da tela (`calc(100vh - 200px)`), com o cabeçalho
                fixo (`shrink-0`) e só o grid de miniaturas rolando por
                dentro (`flex-1 min-h-0 overflow-y-auto`) — antes a coluna
                crescia junto com o conteúdo, exigindo rolar a página toda. */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-2 pt-3 [scrollbar-gutter:stable]">
              {itensAvisos.length === 0 ? (
                <div className="text-center py-20 text-gray-500 space-y-2">
                  <Megaphone className="w-10 h-10 mx-auto text-gray-700 stroke-1" />
                  <p className="text-xs font-medium">Nenhum comunicado ou aviso cadastrado no momento.</p>
                </div>
              ) : (
                <div className="grid gap-3 pb-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {avisosOrdenados.map((a: any) => renderAvisoMini(a))}
                </div>
              )}
            </div>

          </div>

          {/* ======================================================== */}
          {/* COLUNA 2: NOTIFICAÇÕES (ESTILO DIFERENCIADO + ÍCONES COMPATÍVEIS COM O NÍVEL) */}
          {/* ======================================================== */}
          <div
            className="bg-[#121212] border border-[#222] rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col"
            style={{ height: 'calc(100vh - 200px)' }}
          >

            {/* Cabeçalho da Coluna de Notificações */}
            <div className="flex items-center justify-between pb-4 border-b border-[#222] gap-3 shrink-0">
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

            {/* Corpo: quadro de miniaturas clicáveis (fixados primeiro) —
                mesma mecânica de altura total/rolagem interna da coluna de
                Avisos, ver comentário equivalente acima. */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-2 pt-3 [scrollbar-gutter:stable]">
              {itensNotificacoes.length === 0 ? (
                <div className="text-center py-20 text-gray-500 space-y-2">
                  <Bell className="w-10 h-10 mx-auto text-gray-700 stroke-1" />
                  <p className="text-xs font-medium">Nenhuma notificação registrada no momento.</p>
                </div>
              ) : (
                <div className="grid gap-3 pb-1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {notifOrdenadas.map((n: any) => renderNotificacaoMini(n))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Modal de detalhe — reutiliza os cards completos originais
          (renderAvisoCard/renderNotificacaoCard) sem alteração; a miniatura
          é apenas um atalho visual, todas as ações (marcar lido, arquivar,
          reativar) continuam disponíveis aqui dentro. */}
      {itemEmFoco && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto"
          onClick={() => setItemEmFocoId(null)}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            {itemEmFoco.tipo === 'NOTIFICACAO' ? renderNotificacaoCard(itemEmFoco) : renderAvisoCard(itemEmFoco)}
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={() => setItemEmFocoId(null)}
                className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer bg-[#111] border border-[#333] rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
