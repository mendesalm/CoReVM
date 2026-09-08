// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import { Mail, Lock, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../compartilhado/contextos/AuthContext';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';
import { GoogleLogin } from '@react-oauth/google';

export default function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleGoogleSuccess = async (_credentialResponse: any) => {
    setErro(null);
    setCarregando(true);
    try {
      // Mock do Login do Google
      await new Promise(resolve => setTimeout(resolve, 800));
      const tokenMock = "token_google_fake";
      // Assumindo que o google traz alguem logado como presidente por padrao
      const fakeConselhoId = "123e4567-e89b-12d3-a456-426614174000"; 
      login(tokenMock, {
        id: "102",
        nome: "Usuário Google",
        email: "usuario@gmail.com",
        roles: ["presidente_conselho"],
        conselho_id: fakeConselhoId
      });
      navigate(`/regiao/${fakeConselhoId}`, { replace: true });
    } catch (err: any) {
      setErro('Falha no login com Google.');
    } finally {
      setCarregando(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      // MOCK DE LOGIN PARA O COREVM
      // 1. Simula requisição para a API do e-Sigma
      await new Promise(resolve => setTimeout(resolve, 800));

      if (email === 'superadmin@esigma.com') {
        const tokenMock = "token_superadmin_fake";
        login(tokenMock, {
          id: "999",
          nome: "Super Administrador",
          email: email,
          roles: ["superadmin"]
        });
        navigate('/superadmin', { replace: true });
        
      } else if (email === 'presidente@conselho.com') {
        const tokenMock = "token_presidente_fake";
        const fakeConselhoId = "123e4567-e89b-12d3-a456-426614174000"; // UUID mockado
        login(tokenMock, {
          id: "101",
          nome: "Presidente Regional",
          email: email,
          roles: ["presidente_conselho"],
          conselho_id: fakeConselhoId
        });
        navigate(`/regiao/${fakeConselhoId}`, { replace: true });

      } else {
        throw new Error('Credenciais inválidas. Use superadmin@esigma.com ou presidente@conselho.com');
      }

    } catch (err: any) {
      setErro(err.message || 'Falha na autenticação. Verifique seu e-mail e senha.');
    } finally {
      setCarregando(false);
    }
  };

  const preencherCredencialRapida = (tipo: 'SUPER' | 'PRESIDENTE') => {
    if (tipo === 'SUPER') {
      setEmail('superadmin@esigma.com');
      setSenha('senha123');
    } else {
      setEmail('presidente@conselho.com');
      setSenha('senha123');
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

          {/* Botões MOCK Temporários para UX testing */}
          <div className="mt-8 border-t border-gray-800 pt-6">
            <p className="text-[10px] text-gray-500 text-center mb-3">TESTE RÁPIDO (MOCK)</p>
            <div className="flex gap-2">
              <button 
                onClick={() => preencherCredencialRapida('SUPER')}
                className="flex-1 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg flex items-center justify-center gap-1 border border-gray-700"
              >
                <Shield size={12} className="text-purple-400" />
                SuperAdmin
              </button>
              <button 
                onClick={() => preencherCredencialRapida('PRESIDENTE')}
                className="flex-1 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg flex items-center justify-center gap-1 border border-gray-700"
              >
                <Shield size={12} className="text-yellow-500" />
                Presidente
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
