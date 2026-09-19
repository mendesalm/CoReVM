// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  UserPlus, Loader2, CheckCircle2, XCircle, ArrowLeft,
  RefreshCw, AlertTriangle, Mail, Phone, Hash, Building2, UserCog,
} from 'lucide-react';
import { useAuth } from '../../compartilhado/contextos/AuthContext';

// Criada em 2026-09-17 para fechar a lacuna documentada em
// claude/estado-modulos-corevm.md ("Tela de aprovação no frontend do
// CoReVM para a Solicitação de Cadastro (hoje só API/Swagger)"). Consome
// diretamente as rotas AUTENTICADAS do e-Sigma (não do CoReVM) —
// GET/POST /solicitacoes-cadastro/... — usando o mesmo token real do
// login (ver PaginaTrocarSenhaObrigatoria.tsx para o mesmo padrão de
// chamada direta com axios + Authorization: Bearer, já que o
// `clienteHttp` compartilhado aponta para o backend do CoReVM, não o do
// e-Sigma).
//
// Quem pode ver/aprovar/rejeitar é decidido pelo PRÓPRIO backend do
// e-Sigma (servicos.py::exigir_aprovador_elegivel): SuperAdmin/webmaster
// veem e decidem qualquer solicitação; qualquer outro token só vê (e só
// pode decidir) as solicitações da(s) Loja(s) onde tem vínculo ATIVO como
// VM/Suplente (tabela MembroOrganizacao do e-Sigma — não é o mesmo dado
// de VM/Suplente do módulo Lojas/CoReVM, é uma checagem própria e
// separada). Por isso esta tela não restringe nada no cliente: quem não é
// elegível para nenhuma solicitação simplesmente vê a lista vazia.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';

const GRAUS_MACONICOS: Record<number, string> = { 1: 'Aprendiz', 2: 'Companheiro', 3: 'Mestre' };

const STATUS_FILTROS = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADO', rotulo: 'Aprovadas' },
  { valor: 'REJEITADO', rotulo: 'Rejeitadas' },
  { valor: 'REJEITADO_AUTOMATICO', rotulo: 'Rejeitadas automaticamente' },
  { valor: '', rotulo: 'Todas' },
];

interface Solicitacao {
  id: string;
  potencia_informada: string;
  numero_loja_informado: string;
  nome_loja_informado: string;
  nome_completo: string;
  grau_maconico: number;
  cim: string;
  cpf: string;
  email: string;
  telefone: string;
  cargo_atual: string;
  data_inicio_mandato: string | null;
  status: string;
  motivo_interno: string | null;
  motivo_rejeicao: string | null;
  version: number;
  criado_em: string;
}

// Conflito de cargo (2026-09-17, decisão do usuário): quando o cargo do
// candidato já tem um titular ATIVO na mesma Loja, o backend bloqueia a
// aprovação com 409 (`detail.tipo === 'conflito_cargo'`) em vez de
// duplicar o cargo silenciosamente. Só quem já é elegível para
// aprovar/rejeitar esta solicitação (SuperAdmin/webmaster, ou VM/Suplente
// da própria Loja — mesma checagem do backend) chega a ver este aviso,
// porque só ele consegue clicar em "Aprovar" para essa solicitação.
interface ConflitoCargo {
  solicitacaoId: string;
  cargo: string;
  titularAtual: {
    membro_organizacao_id: string;
    pessoa_id: string;
    nome_completo: string | null;
    cim: string | null;
    desde: string | null;
  };
}

export default function PaginaSolicitacoesCadastro() {
  const { token } = useAuth();
  const [lista, setLista] = useState<Solicitacao[]>([]);
  const [statusFiltro, setStatusFiltro] = useState('PENDENTE');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [motivoPorId, setMotivoPorId] = useState<Record<string, string>>({});
  const [idExpandidoRejeicao, setIdExpandidoRejeicao] = useState<string | null>(null);
  const [conflito, setConflito] = useState<ConflitoCargo | null>(null);
  const [novoCargoPorId, setNovoCargoPorId] = useState<Record<string, string>>({});

  const buscarLista = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await axios.get(`${ESIGMA_API_URL}/solicitacoes-cadastro/`, {
        headers: { Authorization: `Bearer ${token}` },
        params: statusFiltro ? { status_filtro: statusFiltro } : {},
      });
      setLista(resposta.data || []);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Não foi possível carregar as solicitações.');
    } finally {
      setCarregando(false);
    }
  }, [token, statusFiltro]);

  useEffect(() => {
    buscarLista();
  }, [buscarLista]);

  const aprovar = async (
    solicitacao: Solicitacao,
    resolucao?: { resolucao_conflito_cargo: 'destituir_anterior' | 'novo_cargo'; novo_cargo?: string }
  ) => {
    setProcessandoId(solicitacao.id);
    setErro(null);
    setMensagem(null);
    try {
      await axios.post(
        `${ESIGMA_API_URL}/solicitacoes-cadastro/${solicitacao.id}/aprovar`,
        { version: solicitacao.version, ...(resolucao || {}) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMensagem(`Solicitação de ${solicitacao.nome_completo} aprovada. A senha provisória foi enviada por e-mail.`);
      setConflito(null);
      await buscarLista();
    } catch (err: any) {
      const detalhe = err.response?.data?.detail;
      if (err.response?.status === 409 && detalhe && typeof detalhe === 'object' && detalhe.tipo === 'conflito_cargo') {
        // Cargo já ocupado por outro membro ATIVO na mesma Loja — não é
        // erro genérico, é uma decisão que só quem já pode aprovar esta
        // solicitação (SuperAdmin/webmaster, ou VM/Suplente da própria
        // Loja) toma: destituir o titular anterior, definir outro cargo
        // para o candidato, ou negar o cadastro (botão "Rejeitar" já
        // existente, sem precisar de campo novo).
        setConflito({ solicitacaoId: solicitacao.id, cargo: detalhe.cargo, titularAtual: detalhe.titular_atual });
      } else if (err.response?.status === 409) {
        setErro('Esta solicitação já foi processada por outra pessoa enquanto você olhava a tela. A lista foi atualizada.');
        await buscarLista();
      } else {
        setErro(err.response?.data?.detail || err.message || 'Não foi possível aprovar a solicitação.');
      }
    } finally {
      setProcessandoId(null);
    }
  };

  const rejeitar = async (solicitacao: Solicitacao) => {
    const motivo = (motivoPorId[solicitacao.id] || '').trim();
    if (motivo.length < 3) {
      setErro('Informe um motivo com pelo menos 3 caracteres para rejeitar.');
      return;
    }
    setProcessandoId(solicitacao.id);
    setErro(null);
    setMensagem(null);
    try {
      await axios.post(
        `${ESIGMA_API_URL}/solicitacoes-cadastro/${solicitacao.id}/rejeitar`,
        { version: solicitacao.version, motivo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMensagem(`Solicitação de ${solicitacao.nome_completo} rejeitada. O motivo foi enviado por e-mail ao candidato.`);
      setIdExpandidoRejeicao(null);
      setConflito(null);
      await buscarLista();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setErro('Esta solicitação já foi processada por outra pessoa enquanto você olhava a tela. A lista foi atualizada.');
        await buscarLista();
      } else {
        setErro(err.response?.data?.detail || err.message || 'Não foi possível rejeitar a solicitação.');
      }
    } finally {
      setProcessandoId(null);
    }
  };

  const corDoStatus = (status: string) => {
    switch (status) {
      case 'PENDENTE': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
      case 'APROVADO': return 'bg-green-500/10 text-green-300 border-green-500/30';
      case 'REJEITADO': return 'bg-red-500/10 text-red-300 border-red-500/30';
      case 'REJEITADO_AUTOMATICO': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-[#facc15]" />
          <h1 className="text-xl font-bold text-white">Solicitações de Cadastro</h1>
        </div>
        <button
          type="button"
          onClick={buscarLista}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-[#facc15] transition-colors px-3 py-1.5 rounded-lg border border-[#333] hover:border-[#facc15]/40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-5">
        Aprovar cria a Pessoa no e-Sigma e envia uma senha provisória por e-mail. Rejeitar envia o motivo por
        e-mail ao candidato. Você só vê e decide as solicitações para as quais tem permissão (SuperAdmin/webmaster,
        ou VM/Suplente ativo da própria Loja) — o backend decide isso, não esta tela.
      </p>

      <div className="flex gap-2 mb-5 flex-wrap">
        {STATUS_FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            type="button"
            onClick={() => setStatusFiltro(f.valor)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFiltro === f.valor
                ? 'bg-[#facc15]/10 text-[#facc15] border-[#facc15]/40'
                : 'text-gray-400 border-[#333] hover:text-white hover:border-[#555]'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
        </div>
      )}
      {mensagem && (
        <div className="mb-4 p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-xs text-green-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {mensagem}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500 border border-dashed border-[#333] rounded-2xl">
          Nenhuma solicitação {statusFiltro ? `com status "${statusFiltro}"` : ''} para mostrar.
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <div key={s.id} className="bg-[#141414] border border-[#262626] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{s.nome_completo}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${corDoStatus(s.status)}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {GRAUS_MACONICOS[s.grau_maconico] || s.grau_maconico} — {s.cargo_atual}
                  </p>
                </div>
                <p className="text-[10px] text-gray-500">
                  {new Date(s.criado_em).toLocaleString('pt-BR')}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs text-gray-400">
                <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-gray-600" /> CIM {s.cim}</div>
                <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-gray-600" /> CPF {s.cpf}</div>
                <div className="flex items-center gap-1.5 truncate"><Mail className="w-3.5 h-3.5 text-gray-600 shrink-0" /> {s.email}</div>
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-600" /> {s.telefone}</div>
              </div>

              <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                <Building2 className="w-3.5 h-3.5 text-gray-600" />
                Loja {s.numero_loja_informado} — {s.nome_loja_informado} · Potência informada: {s.potencia_informada}
              </div>

              {s.motivo_interno && (
                <div className="mt-2 text-[11px] text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                  <strong>Divergência encontrada na validação automática:</strong> {s.motivo_interno}
                </div>
              )}
              {s.motivo_rejeicao && (
                <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <strong>Motivo da rejeição:</strong> {s.motivo_rejeicao}
                </div>
              )}

              {conflito && conflito.solicitacaoId === s.id && (
                <div className="mt-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-100">
                  <div className="flex items-start gap-2">
                    <UserCog className="w-4 h-4 shrink-0 mt-0.5 text-orange-300" />
                    <div>
                      <strong>Cargo "{conflito.cargo}" já está ocupado nesta Loja</strong> por{' '}
                      {conflito.titularAtual.nome_completo || 'outro membro'}
                      {conflito.titularAtual.cim ? ` (CIM ${conflito.titularAtual.cim})` : ''}
                      {conflito.titularAtual.desde
                        ? `, desde ${new Date(conflito.titularAtual.desde).toLocaleDateString('pt-BR')}`
                        : ''}
                      . Escolha o que fazer:
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <button
                      type="button"
                      disabled={processandoId === s.id}
                      onClick={() => aprovar(s, { resolucao_conflito_cargo: 'destituir_anterior' })}
                      className="bg-orange-600/90 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Destituir o titular anterior e aprovar
                    </button>
                    <button
                      type="button"
                      disabled={processandoId === s.id}
                      onClick={() => {
                        setConflito(null);
                        setIdExpandidoRejeicao(s.id);
                      }}
                      className="bg-[#2a2a2a] hover:bg-red-600/80 disabled:opacity-50 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-[#3a3a3a]"
                    >
                      Negar o cadastro
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={novoCargoPorId[s.id] || ''}
                      onChange={(e) => setNovoCargoPorId((atual) => ({ ...atual, [s.id]: e.target.value }))}
                      placeholder='Ou defina um novo cargo para este candidato (ex.: "Obreiro")'
                      className="flex-1 bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2 text-xs text-white focus:border-orange-500/50 outline-none"
                    />
                    <button
                      type="button"
                      disabled={processandoId === s.id || !(novoCargoPorId[s.id] || '').trim()}
                      onClick={() =>
                        aprovar(s, {
                          resolucao_conflito_cargo: 'novo_cargo',
                          novo_cargo: (novoCargoPorId[s.id] || '').trim(),
                        })
                      }
                      className="bg-orange-600/90 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Definir cargo e aprovar
                    </button>
                  </div>
                </div>
              )}

              {s.status === 'PENDENTE' && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={processandoId === s.id}
                    onClick={() => aprovar(s)}
                    className="flex items-center gap-1.5 bg-green-600/90 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
                  >
                    {processandoId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={processandoId === s.id}
                    onClick={() => {
                      setConflito(null);
                      setIdExpandidoRejeicao(idExpandidoRejeicao === s.id ? null : s.id);
                    }}
                    className="flex items-center gap-1.5 bg-[#2a2a2a] hover:bg-red-600/80 disabled:opacity-50 text-gray-200 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors border border-[#3a3a3a]"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Rejeitar
                  </button>
                </div>
              )}

              {idExpandidoRejeicao === s.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={motivoPorId[s.id] || ''}
                    onChange={(e) => setMotivoPorId((atual) => ({ ...atual, [s.id]: e.target.value }))}
                    placeholder="Motivo da rejeição (mínimo 3 caracteres)"
                    className="flex-1 bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2 text-xs text-white focus:border-red-500/50 outline-none"
                  />
                  <button
                    type="button"
                    disabled={processandoId === s.id}
                    onClick={() => rejeitar(s)}
                    className="bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
                  >
                    Confirmar rejeição
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Link to="/login" className="text-xs text-gray-500 hover:text-[#facc15] inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Voltar
        </Link>
      </div>
    </div>
  );
}
