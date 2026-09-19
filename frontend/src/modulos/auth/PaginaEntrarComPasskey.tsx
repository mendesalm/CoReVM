// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState } from 'react';
import axios from 'axios';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, UserCircle2 } from 'lucide-react';
import { useAuth, clienteHttp } from '../../compartilhado/contextos/AuthContext';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';

// Criada em 2026-09-18, terceiro e último dos métodos de login moderno
// decididos em claude/decisao-modernizacao-login.md (magic link → OTP →
// passkeys). Diferente do magic link (que precisa de uma volta pelo
// e-mail), o login com passkey acontece nesta MESMA tela, do começo ao
// fim: pede o identificador, chama /auth/passkey/login/iniciar para
// pegar o desafio, dispara o prompt nativo do navegador
// (startAuthentication) e conclui em /auth/passkey/login/concluir.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';
const API_URL = 'http://localhost:8003/api/v1';

interface RegiaoVinculada {
  regiao_id: string;
  nome: string;
  papel: string;
}

function decodificarPayloadJwt(token: string): any {
  try {
    const payloadBase64 = token.split('.')[1];
    const payloadJson = decodeURIComponent(
      atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(payloadJson);
  } catch {
    return {};
  }
}

async function buscarMinhasRegioes(): Promise<RegiaoVinculada[]> {
  const resposta = await clienteHttp.get(`${API_URL}/regional/minhas-regioes`);
  return resposta.data || [];
}

function navegarAposLogin(regioes: RegiaoVinculada[], role: string | undefined, navigate: (path: string, opts?: any) => void) {
  if (role === 'super_admin') {
    navigate('/superadmin', { replace: true });
    return;
  }
  if (regioes.length === 0) {
    throw new Error('Login realizado, mas este usuário não possui vínculo com nenhum Conselho Regional cadastrado no CoReVM.');
  }
  navigate(`/regiao/${regioes[0].regiao_id}`, { replace: true });
}

export default function PaginaEntrarComPasskey() {
  const [identificador, setIdentificador] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const { data: opcoes } = await axios.post(`${ESIGMA_API_URL}/auth/passkey/login/iniciar`, {
        identificador,
      });

      // Dispara o prompt nativo do navegador/SO (Face ID, Windows Hello,
      // chave de segurança física, etc.) -- se o identificador não
      // corresponder a ninguém ou a pessoa não tiver nenhuma passkey
      // cadastrada, `allowCredentials` chega vazio e o navegador
      // simplesmente não acha nada para oferecer (mesma resposta visual
      // de "nenhuma passkey disponível" nos dois casos, por desenho
      // anti-enumeração -- ver comentário do endpoint no e-Sigma).
      const assercao = await startAuthentication({ optionsJSON: opcoes });

      const resposta = await axios.post(`${ESIGMA_API_URL}/auth/passkey/login/concluir`, {
        credential: assercao,
        modulo_origem: 'corevm',
      });
      const { access_token, deve_trocar_senha } = resposta.data;
      const payload = decodificarPayloadJwt(access_token);

      login(access_token, {
        id: payload.user_id,
        nome: payload.sub,
        email: payload.sub,
        roles: payload.role ? [payload.role] : [],
      });

      if (deve_trocar_senha) {
        navigate('/trocar-senha-obrigatoria', { replace: true });
        return;
      }

      const regioes = await buscarMinhasRegioes();
      navegarAposLogin(regioes, payload.role, navigate);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        // Usuário cancelou o prompt do navegador, ou nenhuma passkey
        // disponível bateu com o desafio -- não dá pra saber qual dos
        // dois foi, por desenho (o navegador não distingue isso pra nós).
        setErro('Não foi possível usar uma passkey agora. Cancelado ou nenhuma passkey disponível neste dispositivo para este acesso.');
      } else {
        setErro(
          err.response?.data?.detail ||
          err.message ||
          'Não foi possível autenticar com passkey. Tente novamente ou use outro método de login.'
        );
      }
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden z-0">
      <HeroBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#1a1a1a]/60 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-yellow-500/20">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-4">
              <LogoAnimadaCore width={90} height={90} animated={!carregando} />
            </div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-yellow-200 tracking-wider font-sans">
              Entrar com passkey
            </h1>
            <p className="text-sm text-gray-400 mt-2 font-sans">
              Sem senha -- use a biometria ou o PIN do seu dispositivo.
            </p>
          </div>

          {erro && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 text-center">
              {erro}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <input
                type="text"
                id="identificador"
                autoComplete="username webauthn"
                required
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder=" "
                className="peer w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 pt-5 pb-2 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
              />
              <label
                htmlFor="identificador"
                className="absolute left-12 top-1.5 text-[10px] text-gray-500 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-yellow-500"
              >
                E-mail, CIM ou CPF
              </label>
              <UserCircle2 className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 peer-focus:text-yellow-500 transition-colors" />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3.5 px-4 rounded-xl text-sm shadow-[0_4px_14px_rgba(234,179,8,0.2)] hover:shadow-[0_6px_20px_rgba(234,179,8,0.4)] transition-all cursor-pointer disabled:opacity-50 mt-4"
            >
              <Fingerprint className="w-4 h-4" />
              {carregando ? <span>Aguardando o dispositivo...</span> : <span>Continuar com passkey</span>}
            </button>

            <div className="text-center mt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-xs text-gray-400 hover:text-yellow-500 transition-colors underline"
              >
                Voltar para o login com senha
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
