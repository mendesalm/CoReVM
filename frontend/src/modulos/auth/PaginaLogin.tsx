// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, clienteHttp } from '../../compartilhado/contextos/AuthContext';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';
import { GoogleLogin } from '@react-oauth/google';

const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8001/api/v1';
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

export default function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrarMe, setLembrarMe] = useState(false);
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
      const resposta = await axios.post(`${ESIGMA_API_URL}/auth/login`, {
        username: email,
        password: senha,
        modulo_origem: 'corevm'
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
      setErro(err.response?.data?.detail || err.message || 'Falha na autenticação. Verifique seu e-mail, CIM ou CPF e a senha.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#050508] z-0">
      {/* Background Animado de Partículas idêntico ao e-Sigma */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <HeroBackground />
      </div>

      <div className="w-full max-w-md relative z-10 my-auto py-6">
        {/* Cartão de Login - Glassmorphism Soberano Deep Blue Glass */}
        <div className="card-deep-blue-glass p-8 sm:p-10 flex flex-col items-center">

          {/* Logo e Título Padronizados como Clone Visual do e-Sigma */}
          <div className="flex flex-col items-center text-center mb-6">
            <div id="hero-logo" className="mb-2 flex justify-center">
              <LogoAnimadaCore width={100} height={90} animated={true} />
            </div>

            <h1 className="text-3xl font-bold tracking-wider font-sans text-transparent bg-clip-text bg-gradient-to-r from-[#FDE68A] via-[#DDB96B] to-[#B8862D] drop-shadow-[0_0_10px_rgba(221,185,107,0.35)]">
              Acesso Restrito
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-sans">
              Insira suas credenciais para continuar
            </p>
          </div>

          {/* Alerta de Erro */}
          {erro && (
            <div className="w-full mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 text-center">
              {erro}
            </div>
          )}

          {/* Formulário Principal */}
          <form onSubmit={handleLogin} className="w-full space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail, CIM ou CPF
              </label>
              <input
                type="text"
                id="identificador"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Insira seu identificador"
                className="w-full bg-[#0a1428]/60 border border-white/15 focus:border-[#DDB96B] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all shadow-inner focus:ring-1 focus:ring-[#DDB96B]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  id="senha"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Insira sua senha"
                  className="w-full bg-[#0a1428]/60 border border-white/15 focus:border-[#DDB96B] rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 outline-none transition-all shadow-inner focus:ring-1 focus:ring-[#DDB96B]/50"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  aria-label="Alternar visibilidade da senha"
                >
                  {mostrarSenha ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            {/* Linha Lembrar-me e Esqueci a Senha */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-300">
                <input
                  type="checkbox"
                  checked={lembrarMe}
                  onChange={(e) => setLembrarMe(e.target.checked)}
                  className="rounded border-slate-700 text-[#DDB96B] focus:ring-[#DDB96B] bg-[#0a1428]"
                />
                <span>Lembrar-me</span>
              </label>
              <button
                type="button"
                onClick={() => navigate('/esqueci-senha')}
                className="text-xs text-[#DDB96B] hover:underline"
              >
                Esqueci a senha
              </button>
            </div>

            {/* Botão de Submissão no estilo Pill Oficial */}
            <button
              type="submit"
              disabled={carregando}
              className="btn-masonic-pill btn-pill-blue w-full py-3.5 px-4 text-base font-semibold mt-4 cursor-pointer disabled:opacity-50"
            >
              {carregando ? 'Autenticando...' : 'Entrar'}
            </button>

            {/* Divisor "ou" */}
            <div className="flex items-center my-5 w-full">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="px-3 text-xs text-slate-400">ou</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>

            {/* Google Login */}
            <div className="flex justify-center mb-4 w-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setErro('Ocorreu um erro ao tentar fazer login com o Google')}
                theme="filled_black"
                text="continue_with"
                width="100%"
              />
            </div>

            {/* Links Auxiliares no Rodapé */}
            <div className="text-center pt-2 space-y-2">
              <p className="text-xs text-slate-400">
                Não tem uma conta?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/solicitar-cadastro')}
                  className="text-[#DDB96B] font-semibold hover:underline"
                >
                  Solicitar cadastro
                </button>
              </p>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/entrar-com-link')}
                  className="hover:text-[#DDB96B] hover:underline transition-colors"
                >
                  Entrar sem senha (link)
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => navigate('/entrar-com-passkey')}
                  className="hover:text-[#DDB96B] hover:underline transition-colors"
                >
                  Entrar com passkey
                </button>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
