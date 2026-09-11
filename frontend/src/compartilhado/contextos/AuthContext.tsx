// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Interfaces
interface Usuario {
  id: string;
  nome: string;
  email: string;
  roles: string[]; // ex: ["superadmin", "presidente_conselho"]
  conselho_id?: string; // UUID da região
}

interface AuthContextType {
  usuario: Usuario | null;
  token: string | null;
  carregando: boolean;
  login: (token: string, usuarioData: Usuario) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const clienteHttp = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
});

// Interceptor para injetar o token
clienteHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('@corevm:token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Decodifica (sem verificar assinatura — isso é responsabilidade do e-Sigma,
 * que já assinou o token no login) o payload de um JWT real emitido pelo
 * e-Sigma, só para restaurar os dados de exibição do usuário ao recarregar
 * a página. Duplicada de PaginaLogin.tsx por serem módulos pequenos e sem
 * um util compartilhado ainda — se surgir um terceiro uso, mover para
 * compartilhado/utils.
 */
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

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('@corevm:token');
      if (storedToken) {
        try {
          // ALTERAÇÃO (2026-09-11): antes esta função fabricava um usuário
          // mockado ("Usuário Logado", role decidido por uma string mágica
          // dentro do próprio token) — resquício de quando o login inteiro
          // era simulado (PaginaLogin.tsx). Agora que o login guarda um JWT
          // real emitido pelo e-Sigma, decodificamos o payload de verdade
          // para restaurar a sessão ao recarregar a página.
          setToken(storedToken);
          const payload = decodificarPayloadJwt(storedToken);
          setUsuario({
            id: payload.user_id || '',
            nome: payload.sub || '',
            email: payload.sub || '',
            roles: payload.role ? [payload.role] : [],
          });
        } catch (error) {
          localStorage.removeItem('@corevm:token');
        }
      }
      setCarregando(false);
    };

    initAuth();
  }, []);

  const login = (newToken: string, usuarioData: Usuario) => {
    localStorage.setItem('@corevm:token', newToken);
    setToken(newToken);
    setUsuario(usuarioData);
  };

  const logout = () => {
    localStorage.removeItem('@corevm:token');
    setToken(null);
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, token, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
