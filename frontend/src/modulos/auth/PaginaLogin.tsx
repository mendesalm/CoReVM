// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Mail, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, clienteHttp } from '../../compartilhado/contextos/AuthContext';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';
import { GoogleLogin } from '@react-oauth/google';

// ALTERAÇÃO (2026-09-11): login real contra o e-Sigma (IdP central do
// ecossistema — ver seção 9 do documento de contexto de implementação).
// Antes, esta tela era 100% mock: nenhuma chamada de rede acontecia, e um
// token fabricado (ex.: "token_presidente_fake") era guardado direto no
// localStorage. Isso nunca foi detectado como problema porque a tela do
// CoReVM que de fato lia esse token (PaginaLojas.tsx) também nunca usava o
// token — ela mandava um header X-User-Id simulado à parte. Depois que
// PaginaLojas.tsx foi corrigida para exigir Authorization real (auditoria de
// 2026-09-11), esse acidente parou de "funcionar", e ficou claro que não
// havia nenhum caminho de login de verdade no CoReVM.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8001/api/v1';
const API_URL = 'http://localhost:8003/api/v1';

interface RegiaoVinculada {
  regiao_id: string;
  nome: string;
  papel: string;
}

/**
 * Decodifica (sem verificar assinatura — isso já foi feito pelo e-Sigma)
 * o payload de um JWT só para preencher os dados de exibição do usuário no
 * AuthContext local. A fonte de verdade da identidade continua sendo o
 * e-Sigma: qualquer chamada de API sensível revalida o token no backend via
 * GET /auth/validate (core/auth_esigma.py do CoReVM), nunca confia só no que
 * está decodificado aqui no cliente.
 */
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

/**
 * Depois de autenticar contra o e-Sigma, o CoReVM ainda precisa descobrir a
 * quais Conselhos Regionais (conceito que só existe no CoReVM, o e-Sigma não
 * sabe o que é uma "Região") essa identidade tem vínculo, para decidir para
 * onde navegar. Consulta a rota nova GET /regional/minhas-regioes (criada
 * junto com este login real).
 */
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
  // LIMITAÇÃO CONHECIDA: se a pessoa tem vínculo com mais de uma Região
  // (ex.: VM de Loja que participa de dois Conselhos), navegamos para a
  // primeira encontrada. Ainda não existe uma tela de seleção de Região —
  // registrar como próximo passo se isso for um caso real no ecossistema.
  navigate(`/regiao/${regioes[0].regiao_id}`, { replace: true });
}

export default function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setErro(null);
    setCarregando(true);
    try {
      const credential = credentialResponse?.credential;
      if (!credential) throw new Error('O Google não retornou uma credencial válida.');

      const resposta = await axios.post(`${ESIGMA_API_URL}/auth/google`, {
        credential,
        modulo_origem: 'corevm'
      });
      const { access_token } = resposta.data;
      const payload = decodificarPayloadJwt(access_token);

      login(access_token, {
        id: payload.user_id,
        nome: payload.sub,
        email: payload.sub,
        roles: payload.role ? [payload.role] : [],
      });

      const regioes = await buscarMinhasRegioes();
      navegarAposLogin(regioes, payload.role, navigate);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Falha no login com Google.');
    } finally {
      setCarregando(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      // Login real: POST /auth/login no e-Sigma (IdP central). Retorna um
      // JWT genuíno assinado com a JWT_SECRET_KEY do e-Sigma — o mesmo token
      // que o backend do CoReVM valida via GET /auth/validate a cada
      // requisição protegida (core/auth_esigma.py).
      const resposta = await axios.post(`${ESIGMA_API_URL}/auth/login`, {
        username: email,
        password: senha,
        modulo_origem: 'corevm'
      });
      const { access_token } = resposta.data;
      const payload = decodificarPayloadJwt(access_token);

      login(access_token, {
        id: payload.user_id,
        nome: payload.sub,
        email: payload.sub,
        roles: payload.role ? [payload.role] : [],
      });

      const regioes = await buscarMinhasRegioes();
      navegarAposLogin(regioes, payload.role, navigate);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Falha na autenticação. Verifique seu e-mail e senha.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden z-0">

      {/* Background Animado */}
      <HeroBackground />

      <div className="w-full max-w-md relative z-10">

        {/* Cartão de Login - Glassmorphism */}
        <div className="bg-[#1a1a1a]/60 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-yellow-500/20">

          {/* Logo e Título */}
          <div className="flex flex-col items-center text-center mb-8">
            <div id="hero-logo" className="mb-4">
              <LogoAnimadaCore width={110} height={110} animated={true} />
            </div>

            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-yellow-200 tracking-wider font-sans drop-shadow-[0_0_10px_rgba(234,179,8,0.2)]">
              E-Sigma: CoRe
            </h1>
            <p className="text-sm text-gray-400 mt-2 font-sans">
              Conselho Regional de Veneráveis Mestres
            </p>
          </div>

          {/* Alerta de Erro */}
          {erro && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 text-center">
              {erro}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="relative group">
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                  className="peer w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 pt-5 pb-2 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <label
                  htmlFor="email"
                  className="absolute left-12 top-1.5 text-[10px] text-gray-500 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-yellow-500"
                >
                  E-mail do Usuário
                </label>
                <Mail className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 peer-focus:text-yellow-500 transition-colors" />
              </div>
            </div>

            <div>
              <div className="relative group">
                <input
                  type="password"
                  id="senha"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder=" "
                  className="peer w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 pt-5 pb-2 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <label
                  htmlFor="senha"
                  className="absolute left-12 top-1.5 text-[10px] text-gray-500 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-yellow-500"
                >
                  Senha
                </label>
                <Lock className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 peer-focus:text-yellow-500 transition-colors" />
              </div>
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3.5 px-4 rounded-xl text-sm shadow-[0_4px_14px_rgba(234,179,8,0.2)] hover:shadow-[0_6px_20px_rgba(234,179,8,0.4)] transition-all cursor-pointer disabled:opacity-50 mt-4"
            >
              {carregando ? (
                <span>Autenticando...</span>
              ) : (
                <span>Acessar Painel</span>
              )}
            </button>
          </form>

          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="px-4 text-xs text-slate-500">ou</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <div className="flex justify-center mb-6">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setErro('Ocorreu um erro ao tentar fazer login com o Google')}
              theme="filled_black"
              text="continue_with"
              width="100%"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
