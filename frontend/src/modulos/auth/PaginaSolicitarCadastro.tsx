// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Building2, Hash, Landmark, User, Mail, Phone, Briefcase, GraduationCap, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HeroBackground from '../../compartilhado/componentes/HeroBackground';
import LogoAnimadaCore from '../../compartilhado/componentes/LogoAnimadaCore';

// Criada em 2026-09-16 para SUBSTITUIR a "Ativação de Cadastro"
// (PaginaAtivacaoCadastro.tsx, removida no mesmo dia). Aquele fluxo
// permitia que o próprio candidato se auto-ativasse só provando controle
// do e-mail, sem NENHUMA validação humana — contrariava a concepção
// original do e-Sigma (ver claude/decisao-controle-acesso-cadastro.md,
// seções 2 e 12). Este formulário é a "Via 2" de verdade: submissão cai
// numa fila de análise (SuperAdmin ou VM/Suplente da própria Loja) e só na
// aprovação o sistema cria a Pessoa e envia uma SENHA PROVISÓRIA por
// e-mail — nunca uma senha escolhida pelo próprio candidato nesta etapa.
//
// ATUALIZAÇÃO (2026-09-16, mesmo dia): por pedido explícito do usuário,
// TODOS os campos abaixo são obrigatórios (nada mais é "(opcional)"), e a
// Loja passou a ter dois campos separados — número e nome — em vez de um
// único campo livre. O campo de Potência continua deliberadamente sem
// nenhuma sugestão/autocomplete (nem do backend, nem do próprio navegador
// — ver `autoComplete="off"` abaixo) — é um filtro anti-curioso
// intencional (decisao-controle-acesso-cadastro.md, seção 2.3): quem é da
// Potência sabe o nome de cor, quem não é tende a errar.
const ESIGMA_API_URL = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';

const GRAUS_MACONICOS = [
  { valor: 1, rotulo: 'Aprendiz' },
  { valor: 2, rotulo: 'Companheiro' },
  { valor: 3, rotulo: 'Mestre' },
];

interface FormularioSolicitacao {
  potencia_informada: string;
  numero_loja_informado: string;
  nome_loja_informado: string;
  nome_completo: string;
  grau_maconico: string;
  cim: string;
  cpf: string;
  email: string;
  telefone: string;
  cargo_atual: string;
}

const FORMULARIO_VAZIO: FormularioSolicitacao = {
  potencia_informada: '',
  numero_loja_informado: '',
  nome_loja_informado: '',
  nome_completo: '',
  grau_maconico: '',
  cim: '',
  cpf: '',
  email: '',
  telefone: '',
  cargo_atual: '',
};

export default function PaginaSolicitarCadastro() {
  const [form, setForm] = useState<FormularioSolicitacao>(FORMULARIO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const navigate = useNavigate();

  const atualizarCampo = (campo: keyof FormularioSolicitacao) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((atual) => ({ ...atual, [campo]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    setCarregando(true);
    try {
      // A resposta é SEMPRE a mesma mensagem genérica (200), exista ou não
      // o cadastro, esteja a combinação Potência/Loja correta ou não —
      // anti-enumeração deliberada (decisao-controle-acesso-cadastro.md,
      // seção 2.1/2.3). O frontend nunca deve tentar inferir sucesso além
      // de "a submissão foi recebida".
      const resposta = await axios.post(`${ESIGMA_API_URL}/solicitacoes-cadastro/`, {
        potencia_informada: form.potencia_informada,
        numero_loja_informado: form.numero_loja_informado,
        nome_loja_informado: form.nome_loja_informado,
        nome_completo: form.nome_completo,
        grau_maconico: Number(form.grau_maconico),
        cim: form.cim,
        cpf: form.cpf,
        email: form.email,
        telefone: form.telefone,
        cargo_atual: form.cargo_atual,
      });
      setMensagem(resposta.data.mensagem);
      setEnviado(true);
    } catch (err: any) {
      setErro(err.response?.data?.detail || err.message || 'Não foi possível enviar sua solicitação.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden z-0">
      <HeroBackground />

      <div className="w-full max-w-lg relative z-10">
        <div className="bg-[#1a1a1a]/60 backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-yellow-500/20">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-4">
              <LogoAnimadaCore width={90} height={90} animated={true} />
            </div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-yellow-200 tracking-wider font-sans">
              Solicitar Cadastro
            </h1>
            <p className="text-sm text-gray-400 mt-2 font-sans">
              Todos os campos são obrigatórios. Sua solicitação será analisada pela
              Diretoria/SuperAdmin. Se aprovada, você receberá uma senha provisória por e-mail.
            </p>
          </div>

          {erro && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 text-center">
              {erro}
            </div>
          )}

          {enviado ? (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-200 text-center">
              {mensagem}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative group">
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={form.potencia_informada}
                  onChange={atualizarCampo('potencia_informada')}
                  placeholder="Potência (digite de cor — sem sugestões)"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <Landmark className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative group">
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={form.numero_loja_informado}
                    onChange={atualizarCampo('numero_loja_informado')}
                    placeholder="Número da Loja"
                    className="w-full bg-[#222] border border-gray-700 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                  />
                  <Hash className="w-5 h-5 text-gray-500 absolute left-3.5 top-3.5" />
                </div>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={form.nome_loja_informado}
                    onChange={atualizarCampo('nome_loja_informado')}
                    placeholder="Nome da Loja"
                    className="w-full bg-[#222] border border-gray-700 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                  />
                  <Building2 className="w-5 h-5 text-gray-500 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="relative group">
                <input
                  type="text"
                  required
                  value={form.nome_completo}
                  onChange={atualizarCampo('nome_completo')}
                  placeholder="Nome completo"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <User className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <div className="relative group">
                <select
                  required
                  value={form.grau_maconico}
                  onChange={atualizarCampo('grau_maconico')}
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a] appearance-none"
                >
                  <option value="" disabled>
                    Grau maçônico
                  </option>
                  {GRAUS_MACONICOS.map((g) => (
                    <option key={g.valor} value={g.valor}>
                      {g.rotulo}
                    </option>
                  ))}
                </select>
                <GraduationCap className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={form.cim}
                  onChange={atualizarCampo('cim')}
                  placeholder="CIM"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl px-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <input
                  type="text"
                  required
                  value={form.cpf}
                  onChange={atualizarCampo('cpf')}
                  placeholder="CPF"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl px-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
              </div>

              <div className="relative group">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={atualizarCampo('email')}
                  placeholder="E-mail (é para onde vai a senha provisória, se aprovado)"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <Mail className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <div className="relative group">
                <input
                  type="text"
                  required
                  value={form.telefone}
                  onChange={atualizarCampo('telefone')}
                  placeholder="Telefone"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <Phone className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <div className="relative group">
                <input
                  type="text"
                  required
                  value={form.cargo_atual}
                  onChange={atualizarCampo('cargo_atual')}
                  placeholder="Cargo atual"
                  className="w-full bg-[#222] border border-gray-700 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-yellow-500 outline-none transition-all focus:bg-[#2a2a2a]"
                />
                <Briefcase className="w-5 h-5 text-gray-500 absolute left-4 top-3.5" />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3.5 px-4 rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 mt-4"
              >
                {carregando ? 'Enviando...' : 'Enviar solicitação'}
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-xs text-gray-400 hover:text-yellow-500 transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
