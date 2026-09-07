import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './compartilhado/componentes/Layout';
import PainelSuperAdmin from './modulos/superadmin/PainelSuperAdmin';
import PaginaCalendario from './modulos/calendario/PaginaCalendario';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota Global do SuperAdmin (Sem Sidebar Regional) */}
        <Route path="/" element={<PainelSuperAdmin />} />

        {/* Rotas de um Conselho Regional Específico (Com Sidebar) */}
        <Route path="/regiao/:id" element={<Layout />}>
          <Route index element={<div className="p-8 text-white">Dashboard do Conselho (Gestão de Lojas será aqui)</div>} />
          <Route path="calendario" element={<PaginaCalendario />} />
          <Route path="livros" element={<div className="p-8 text-white">Módulo de Livros em construção...</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
