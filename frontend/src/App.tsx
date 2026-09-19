// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './compartilhado/componentes/Layout';
import PainelSuperAdmin from './modulos/superadmin/PainelSuperAdmin';
import PainelConselho from './modulos/regional/PainelConselho';
import PainelVM from './modulos/local/PainelVM';
import PaginaCalendario from './modulos/calendario/PaginaCalendario';
import PaginaLogin from './modulos/auth/PaginaLogin';
import PaginaSolicitarCadastro from './modulos/auth/PaginaSolicitarCadastro';
import PaginaEsqueciSenha from './modulos/auth/PaginaEsqueciSenha';
import PaginaEntrarComLink from './modulos/auth/PaginaEntrarComLink';
import PaginaConfirmarMagicLink from './modulos/auth/PaginaConfirmarMagicLink';
import PaginaEntrarComPasskey from './modulos/auth/PaginaEntrarComPasskey';
import PaginaGerenciarPasskeys from './modulos/auth/PaginaGerenciarPasskeys';
import PaginaTrocarSenhaObrigatoria from './modulos/auth/PaginaTrocarSenhaObrigatoria';
import PaginaSolicitacoesCadastro from './modulos/auth/PaginaSolicitacoesCadastro';
import PaginaComunicacao from './modulos/regional/submodulos/PaginaComunicacao';
import PaginaLojas from './modulos/regional/submodulos/PaginaLojas';
import PaginaDiretoria from './modulos/regional/submodulos/PaginaDiretoria';
import PaginaAdmissoes from './modulos/regional/submodulos/PaginaAdmissoes';
import PaginaVotacoes from './modulos/regional/submodulos/PaginaVotacoes';
import PaginaPatrimonio from './modulos/regional/submodulos/PaginaPatrimonio';
import PaginaDocumentos from './modulos/regional/submodulos/PaginaDocumentos';
import PaginaRelatorios from './modulos/regional/submodulos/PaginaRelatorios';
import { AuthProvider, useAuth } from './compartilhado/contextos/AuthContext';

function RotaProtegida({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { token, usuario, carregando } = useAuth();
  
  if (carregando) return <div className="h-screen w-screen flex items-center justify-center bg-black text-macaonico-dourado">Carregando CoReVM...</div>;
  if (!token || !usuario) return <Navigate to="/login" replace />;
  if (allowedRoles && !usuario.roles.some(r => allowedRoles.includes(r))) {
    return <div className="p-8 text-red-500">Acesso negado. Nível de permissão insuficiente.</div>;
  }
  
  return <>{children}</>;
}

function AppRotas() {
  return (
    <Routes>
      <Route path="/login" element={<PaginaLogin />} />
      {/* Solicitação de Cadastro (Via 2, 2026-09-16) — substitui a rota
          /ativar-cadastro (removida no mesmo dia junto com a "Ativação de
          Cadastro", que permitia auto-aprovação sem validação humana).
          Pública por natureza: o candidato ainda não existe no sistema. */}
      <Route path="/solicitar-cadastro" element={<PaginaSolicitarCadastro />} />
      {/* Recuperacao de senha (2026-09-16) -- para quem JA TEM cadastro
          e esqueceu a senha; diferente da Solicitacao de Cadastro acima,
          que e para quem ainda nao tem acesso nenhum. Publica por
          natureza (o usuario ainda nao esta autenticado). */}
      <Route path="/esqueci-senha" element={<PaginaEsqueciSenha />} />
      {/* Magic link (2026-09-17) -- primeiro dos metodos de login moderno
          decididos em claude/decisao-modernizacao-login.md (magic link,
          OTP, passkeys; so magic link implementado nesta rodada). As duas
          rotas sao publicas por natureza: /entrar-com-link pede o link
          por e-mail, /magic-link e' onde o link enviado aterrissa
          (le ?token= da URL e troca por uma sessao real). */}
      <Route path="/entrar-com-link" element={<PaginaEntrarComLink />} />
      <Route path="/magic-link" element={<PaginaConfirmarMagicLink />} />
      {/* Passkeys (2026-09-18) -- terceiro e último método de login
          moderno decidido em claude/decisao-modernizacao-login.md.
          /entrar-com-passkey é pública por natureza (login sem sessão
          prévia); /minhas-passkeys exige estar autenticado (é a tela de
          autogestão das próprias passkeys, não fica sob /regiao/:id
          porque não é um conceito de Região -- mesma razão de
          /solicitacoes-cadastro acima). */}
      <Route path="/entrar-com-passkey" element={<PaginaEntrarComPasskey />} />
      <Route path="/minhas-passkeys" element={
        <RotaProtegida><PaginaGerenciarPasskeys /></RotaProtegida>
      } />
      {/* Troca obrigatória da senha provisória enviada por e-mail na
          aprovação de uma Solicitação de Cadastro — exige estar
          autenticado (RotaProtegida), mas sem exigir vínculo com uma
          Região ainda, já que é o primeiro passo depois do login. */}
      <Route path="/trocar-senha-obrigatoria" element={
        <RotaProtegida><PaginaTrocarSenhaObrigatoria /></RotaProtegida>
      } />
      {/* Aprovacao da Solicitacao de Cadastro (2026-09-17) -- tela nova,
          fecha a lacuna que so existia via Swagger. Nao fica sob /regiao/:id
          porque a Solicitacao de Cadastro e' um conceito do e-Sigma (Loja),
          nao uma Regiao do CoReVM -- quem pode ver/decidir e' o proprio
          backend do e-Sigma que resolve (SuperAdmin/webmaster ou VM/Suplente
          da Loja da solicitacao). */}
      <Route path="/solicitacoes-cadastro" element={
        <RotaProtegida><PaginaSolicitacoesCadastro /></RotaProtegida>
      } />

      {/* Rota Global do SuperAdmin (Sem Sidebar Regional) */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/superadmin" element={
        // CORREÇÃO (2026-09-12): o papel emitido pelo e-Sigma no JWT é
        // "super_admin" (com underscore, minúsculo), tanto no backend do
        // e-Sigma (role_primaria) quanto na navegação pós-login do CoReVM
        // (PaginaLogin.tsx, navegarAposLogin). Antes esta rota exigia
        // "superadmin" (sem underscore), o que bloqueava QUALQUER login de
        // superadmin real com "Acesso negado" mesmo com token válido.
        <RotaProtegida allowedRoles={['super_admin']}>
          <PainelSuperAdmin />
        </RotaProtegida>
      } />

      <Route element={<RotaProtegida><Layout /></RotaProtegida>}>
        {/* Módulos do Conselho Regional */}
        <Route path="/regiao/:id" element={<PainelConselho />} />
        <Route path="/regiao/:id/calendario" element={<PaginaCalendario />} />
        <Route path="/regiao/:id/admissoes" element={<PaginaAdmissoes />} />
        <Route path="/regiao/:id/votacoes" element={<PaginaVotacoes />} />
        <Route path="/regiao/:id/patrimonio" element={<PaginaPatrimonio />} />
        <Route path="/regiao/:id/documentos" element={<PaginaDocumentos />} />
        <Route path="/regiao/:id/lojas" element={<PaginaLojas />} />
        <Route path="/regiao/:id/diretoria" element={<PaginaDiretoria />} />
        <Route path="/regiao/:id/relatorios" element={<PaginaRelatorios />} />
        <Route path="/regiao/:id/comunicacao" element={<PaginaComunicacao />} />
        
        {/* Dashboard Específico da Loja */}
        <Route path="/dashboard-loja" element={<PainelVM />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRotas />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
