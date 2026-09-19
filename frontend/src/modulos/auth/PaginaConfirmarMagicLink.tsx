// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../../compartilhado/contextos/AuthContext';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';

// Criada em 2026-09-17 junto com PaginaEntrarComLink.tsx — é a rota que o
// link enviado por e-mail aponta (?token=...). Troca o token de uso único
// por uma sessão real chamando POST /auth/magic-link/confirmar no
// e-Sigma, e segue exatamente o mesmo pós-login de PaginaLogin.tsx
// (checar deve_trocar_senha, buscar Regiões vinculadas, navegar).
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

async function buscarMinhasRegioes(token: string): Promise<RegiaoVinculada[]> {
  const resposta = await axios.get(`${API_URL}/regional/minhas-regioes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export default function PaginaConfirmarMagicLink() {
  const [searchParams] = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();
  // Evita disparar a troca duas vezes (StrictMode/re-render) — o token é
  // de uso único, uma segunda chamada acidental sempre falharia com 401.
  const jaTentou = useRef(false);

  useEffect(() => {
    if (jaTentou.current) return;
    jaTentou.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setErro('Link inválido: nenhum token encontrado na URL.');
      return;
    }

    (async () => {
      try {
        const resposta = await axios.post(`${ESIGMA_API_URL}/auth/magic-link/confirmar`, {
          token,
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

        const regioes = await buscarMinhasRegioes(access_token);
        navegarAposLogin(regioes, payload.role, navigate);
      } catch (err: any) {
        setErro(
          err.response?.data?.detail ||
          err.message ||
          'Não foi possível confirmar o link. Ele pode já ter sido usado ou expirado.'
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden z-0">
      <HeroBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#1a1a1a]/60 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-yellow-500/20 text-center">
          <div className="flex flex-col items-center mb-6">
            <LogoAnimadaCore width={90} height={90} animated={!erro} />
          </div>

          {erro ? (
            <>
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200 flex items-start gap-2 text-left">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
              </div>
              <Link to="/entrar-com-link" className="text-xs text-gray-400 hover:text-yellow-500 transition-colors underline">
                Solicitar um novo link
              </Link>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" /> Confirmando seu acesso...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
