// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState } from 'react';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../compartilhado/contextos/AuthContext';

// Tela de autogestão de passkeys (2026-09-18) -- ver
// claude/decisao-modernizacao-login.md, seção 4, no Project "Core".
// Diferente da Solicitação de Cadastro (que é uma fila para um
// SuperAdmin/VM aprovar o pedido de OUTRA pessoa), esta tela é sempre
// sobre a PRÓPRIA conta de quem está logado -- cadastrar/remover suas
// próprias passkeys. Por isso as rotas (`/auth/passkey/minhas`, `/auth/
// passkey/registro/*`, `DELETE /auth/passkey/{id}`) exigem só estar
// autenticado, sem checagem de papel administrativo.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';

interface Passkey {
  id: string;
  apelido: string | null;
  criado_em: string | null;
  ultimo_uso_em: string | null;
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function PaginaGerenciarPasskeys() {
  const { token } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [cadastrando, setCadastrando] = useState(false);
  const [apelidoNovo, setApelidoNovo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const cabecalhoAuth = { headers: { Authorization: `Bearer ${token}` } };

  const carregarPasskeys = async () => {
    setCarregando(true);
    try {
      const { data } = await axios.get(`${ESIGMA_API_URL}/auth/passkey/minhas`, cabecalhoAuth);
      setPasskeys(data || []);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Não foi possível carregar suas passkeys.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPasskeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCadastrarPasskey = async () => {
    setErro(null);
    setMensagem(null);
    setCadastrando(true);
    try {
      const { data: opcoes } = await axios.post(
        `${ESIGMA_API_URL}/auth/passkey/registro/iniciar`,
        {},
        cabecalhoAuth
      );

      const credencial = await startRegistration({ optionsJSON: opcoes });

      const { data: resultado } = await axios.post(
        `${ESIGMA_API_URL}/auth/passkey/registro/concluir`,
        { credential: credencial, apelido: apelidoNovo.trim() || null },
        cabecalhoAuth
      );

      setMensagem(resultado.mensagem || 'Passkey cadastrada com sucesso.');
      setApelidoNovo('');
      await carregarPasskeys();
    } catch (err: any) {
      if (err?.name === 'InvalidStateError') {
        setErro('Este dispositivo/autenticador já tem uma passkey cadastrada para esta conta.');
      } else if (err?.name === 'NotAllowedError') {
        setErro('Cadastro cancelado ou não permitido pelo navegador/dispositivo.');
      } else {
        setErro(err.response?.data?.detail || err.message || 'Não foi possível cadastrar a passkey.');
      }
    } finally {
      setCadastrando(false);
    }
  };

  const handleRemover = async (id: string) => {
    setErro(null);
    setMensagem(null);
    try {
      await axios.delete(`${ESIGMA_API_URL}/auth/passkey/${id}`, cabecalhoAuth);
      setPasskeys((atual) => atual.filter((p) => p.id !== id));
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Não foi possível remover esta passkey.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Fingerprint className="w-6 h-6 text-yellow-500" />
        <h1 className="text-2xl font-bold text-white">Minhas Passkeys</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Passkeys permitem entrar sem senha, usando a biometria ou o PIN do seu dispositivo
        (Face ID, Windows Hello, chave de segurança física, etc.). Você pode cadastrar mais de
        uma -- uma para cada dispositivo que costuma usar.
      </p>

      {erro && (
        <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="mb-4 p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" /> {mensagem}
        </div>
      )}

      <div className="bg-[#141414] border border-[#242424] rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Cadastrar uma nova passkey neste dispositivo</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={apelidoNovo}
            onChange={(e) => setApelidoNovo(e.target.value)}
            placeholder="Apelido (opcional, ex.: Notebook do trabalho)"
            className="flex-1 bg-[#1f1f1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-yellow-500 outline-none"
          />
          <button
            type="button"
            onClick={handleCadastrarPasskey}
            disabled={cadastrando}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-2.5 px-5 rounded-xl text-sm transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {cadastrando ? 'Aguardando o dispositivo...' : 'Cadastrar passkey'}
          </button>
        </div>
      </div>

      <div className="bg-[#141414] border border-[#242424] rounded-2xl overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-300 px-5 pt-4 pb-2">Passkeys cadastradas</h2>
        {carregando ? (
          <p className="px-5 pb-5 text-sm text-gray-500">Carregando...</p>
        ) : passkeys.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-500">Nenhuma passkey cadastrada ainda.</p>
        ) : (
          <ul className="divide-y divide-[#242424]">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm text-white font-medium">{p.apelido || 'Passkey sem apelido'}</p>
                  <p className="text-xs text-gray-500">
                    Cadastrada em {formatarData(p.criado_em)} · Último uso: {formatarData(p.ultimo_uso_em)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemover(p.id)}
                  title="Remover esta passkey"
                  className="p-2 rounded-lg text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
