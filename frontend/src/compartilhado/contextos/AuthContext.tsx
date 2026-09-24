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
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8003/api/v1',
});

/**
 * Valida a integridade e expiração de um JWT emitido pelo e-Sigma.
 */
function isTokenValido(token?: string | null): boolean {
  if (!token) return false;
  try {
    const payload = decodificarPayloadJwt(token);
    if (!payload || (!payload.sub && !payload.user_id)) {
      return false;
    }
    if (payload.exp && typeof payload.exp === 'number') {
      const agoraSegundos = Math.floor(Date.now() / 1000);
      if (payload.exp <= agoraSegundos) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Recupera o token de sessão ativo do ecossistema, priorizando o token do CoReVM,
 * com fallback para Lojas e e-Sigma (SSO local).
 */
export function obterTokenSessaoValido(): string | null {
  const chaves = ['@corevm:token', '@lojas:token', '@esigma:token'];
  for (const chave of chaves) {
    const t = localStorage.getItem(chave);
    if (t) {
      if (isTokenValido(t)) {
        return t;
      } else {
        localStorage.removeItem(chave);
      }
    }
  }
  return null;
}

// Interceptor para injetar o token ativo
clienteHttp.interceptors.request.use((config) => {
  const token = obterTokenSessaoValido();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Decodifica o payload de um JWT real emitido pelo e-Sigma para restaurar
 * os dados visuais do usuário.
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
      // 1. SSO local (localStorage)
      let storedToken = obterTokenSessaoValido();

      // 2. SSO Multi-Domínio: se não houver localmente, consulta o e-Sigma via cookie HttpOnly
      if (!storedToken) {
        try {
          const esigmaApiUrl = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';
          const resp = await axios.get(`${esigmaApiUrl}/auth/sso/session`, { withCredentials: true });
          if (resp.data?.access_token && isTokenValido(resp.data.access_token)) {
            const tokenSso = String(resp.data.access_token);
            storedToken = tokenSso;
            localStorage.setItem('@corevm:token', tokenSso);
          }
        } catch {
          // Sessão não ativa no e-Sigma
        }
      }

      if (storedToken) {
        try {
          setToken(storedToken);
          localStorage.setItem('@corevm:token', storedToken);
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

  const logout = async () => {
    localStorage.removeItem('@corevm:token');
    localStorage.removeItem('@lojas:token');
    localStorage.removeItem('@esigma:token');
    setToken(null);
    setUsuario(null);

    // Encerra sessão global no e-Sigma
    try {
      const esigmaApiUrl = import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';
      await axios.post(`${esigmaApiUrl}/auth/logout`, {}, { withCredentials: true });
    } catch {
      // Ignora erro de rede durante logout
    }
  };

  return (
    <AuthContext.Provider value={{ usuario, token, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

