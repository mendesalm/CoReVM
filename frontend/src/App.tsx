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
import PaginaTrocarSenhaObrigatoria from './modulos/auth/PaginaTrocarSenhaObrigatoria';
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
      {/* Troca obrigatória da senha provisória enviada por e-mail na
          aprovação de uma Solicitação de Cadastro — exige estar
          autenticado (RotaProtegida), mas sem exigir vínculo com uma
          Região ainda, já que é o primeiro passo depois do login. */}
      <Route path="/trocar-senha-obrigatoria" element={
        <RotaProtegida><PaginaTrocarSenhaObrigatoria /></RotaProtegida>
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
