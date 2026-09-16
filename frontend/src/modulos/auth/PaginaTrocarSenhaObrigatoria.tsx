// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { KeyRound, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';
import { useAuth, clienteHttp } from '../../compartilhado/contextos/AuthContext';

// Criada em 2026-09-16 junto com a Solicitação de Cadastro (Via 2). Quando
// uma Pessoa nasce de uma solicitação aprovada, ela recebe por e-mail uma
// senha PROVISÓRIA gerada pelo sistema (nunca escolhida por ela) — o login
// com essa senha retorna `deve_trocar_senha: true` (ver PaginaLogin.tsx),
// e esta tela é o único lugar por onde esse usuário pode passar antes de
// acessar qualquer outra parte do CoReVM.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';
const API_URL = 'http://localhost:8003/api/v1';

interface RegiaoVinculada {
  regiao_id: string;
  nome: string;
  papel: string;
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
    throw new Error('Senha trocada, mas este usuário não possui vínculo com nenhum Conselho Regional cadastrado no CoReVM.');
  }
  navigate(`/regiao/${regioes[0].regiao_id}`, { replace: true });
}

export default function PaginaTrocarSenhaObrigatoria() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const navigate = useNavigate();
  const { token, usuario } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    // Checagem client-side só para feedback rápido — a validação que
    // importa é a do backend (api/auth/senha_policy.py), que é a que de
    // fato decide se a senha é aceita (2026-09-16, pedido explícito do
    // usuário: "não aceitar senha fraca").
    if (novaSenha.length < 10) {
      setErro('A nova senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (!/[A-Z]/.test(novaSenha) || !/[a-z]/.test(novaSenha) || !/\d/.test(novaSenha) || !/[^A-Za-z0-9]/.test(novaSenha)) {
      setErro('A senha precisa ter letra maiúscula, minúscula, número e um caractere especial.');
      return;
    }
    if (novaSenha !== confirmacaoSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (!token) {
      setErro('Sessão inválida — faça login novamente.');
      navigate('/login', { replace: true });
      return;
    }

    setCarregando(true);
    try {
      await axios.post(
        `${ESIGMA_API_URL}/auth/trocar-senha-obrigatoria`,
        { senha_atual: senhaAtual, nova_senha: novaSenha },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const regioes = await buscarMinhasRegioes();
      navegarAposLogin(regioes, usuario?.roles?.[0], navigate);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Não foi possível trocar a senha.');
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
              <LogoAnimadaCore width={90} height={90} animated={true} />
            </div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-yellow-200 tracking-wider font-sans">
              Defina sua senha
            </h1>
            <p className="text-sm text-gray-400 mt-2 font-sans">
              Você está usando a senha provisória enviada por e-mail. Defina uma nova senha
              para continuar.
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
                type="password"
                required
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Senha provisória (recebida por e-mail)"
                className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
              />
              <KeyRound className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
            </div>

            <div className="relative group">
              <input
                type="password"
                required
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 10, com maiúscula/minúscula/número/especial)"
                className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
              />
              <Lock className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
            </div>

            <div className="relative group">
              <input
                type="password"
                required
                value={confirmacaoSenha}
                onChange={(e) => setConfirmacaoSenha(e.target.value)}
                placeholder="Confirme a nova senha"
                className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
              />
              <Lock className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3.5 px-4 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 mt-4"
            >
              {carregando ? 'Salvando...' : 'Definir nova senha e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
