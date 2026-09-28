// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '123456789-mock-id.apps.googleusercontent.com';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)

import { inicializarDispositivoNativo, configurarBotaoVoltarNativo } from './compartilhado/utilitarios/dispositivoNativo';

// Inicialização de hardware móvel (StatusBar, Splash, Keyboard, Back Button)
inicializarDispositivoNativo();
configurarBotaoVoltarNativo();

// Registro do Service Worker PWA para suporte offline e instalabilidade
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('Falha não-bloqueante no registro do Service Worker:', err);
    });
  });
}

