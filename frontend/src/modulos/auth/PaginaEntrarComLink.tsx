// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Link2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';

// Criada em 2026-09-17 — primeiro dos três métodos de login moderno
// decididos em claude/decisao-modernizacao-login.md (magic link, OTP,
// passkeys; só magic link implementado nesta rodada). Mesmo padrão de
// PaginaEsqueciSenha.tsx: chama POST /auth/magic-link/solicitar no
// e-Sigma, que sempre devolve a mesma resposta genérica (anti-
// enumeração) — o link em si só é enviado para o e-mail JÁ CADASTRADO na
// Pessoa, nunca para um e-mail digitado nesta tela.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';

export default function PaginaEntrarComLink() {
  const [identificador, setIdentificador] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      await axios.post(`${ESIGMA_API_URL}/auth/magic-link/solicitar`, {
        identificador,
        modulo_origem: 'corevm',
      });
      // Mesma cautela de PaginaEsqueciSenha.tsx: sempre mostra sucesso,
      // mesmo que o backend não tenha encontrado ninguém.
      setEnviado(true);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setErro(err.response?.data?.detail || 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');
      } else {
        setEnviado(true);
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
              <LogoAnimadaCore width={90} height={90} animated={false} />
            </div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-yellow-200 tracking-wider font-sans">
              Entrar com Link por E-mail
            </h1>
            <p className="text-sm text-gray-400 mt-2 font-sans">
              Informe seu e-mail, CIM ou CPF já cadastrado. Se encontrarmos um cadastro ativo, enviaremos um link de acesso único para o e-mail já registrado — válido por 15 minutos, sem precisar de senha.
            </p>
          </div>

          {enviado ? (
            <div className="mb-2 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-200 text-center">
              Se o identificador informado corresponder a um cadastro ativo, enviamos um link de acesso para o e-mail cadastrado. Verifique sua caixa de entrada (e o spam).
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {erro && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 text-center">
                  {erro}
                </div>
              )}

              <div className="relative group">
                <input
                  type="text"
                  id="identificador-magic-link"
                  autoComplete="username"
                  required
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder=" "
                  className="peer w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 pt-5 pb-2 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <label
                  htmlFor="identificador-magic-link"
                  className="absolute left-12 top-1.5 text-[10px] text-gray-500 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-yellow-500"
                >
                  E-mail, CIM ou CPF
                </label>
                <Link2 className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 peer-focus:text-yellow-500 transition-colors" />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3.5 px-4 rounded-xl text-sm shadow-[0_4px_14px_rgba(234,179,8,0.2)] hover:shadow-[0_6px_20px_rgba(234,179,8,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                {carregando ? 'Enviando...' : 'Enviar link de acesso'}
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-xs text-gray-400 hover:text-yellow-500 transition-colors underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
