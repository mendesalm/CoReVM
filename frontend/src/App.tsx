// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './compartilhado/componentes/Layout';
import PainelSuperAdmin from './modulos/superadmin/PainelSuperAdmin';
import PainelConselho from './modulos/regional/PainelConselho';
import PainelVM from './modulos/local/PainelVM';
import PaginaCalendario from './modulos/calendario/PaginaCalendario';
import PaginaLogin from './modulos/auth/PaginaLogin';
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

      {/* Rota Global do SuperAdmin (Sem Sidebar Regional) */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/superadmin" element={
        <RotaProtegida allowedRoles={['superadmin']}>
          <PainelSuperAdmin />
        </RotaProtegida>
      } />

      <Route element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route path="/dashboard-conselho/:id" element={<PainelConselho />} />
        <Route path="/dashboard-loja" element={<PainelVM />} />
        <Route path="/calendario" element={<PaginaCalendario />} />
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
