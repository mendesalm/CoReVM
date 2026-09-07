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

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('@corevm:token');
      if (storedToken) {
        try {
          // Em um app real, bateriamos no /auth/me
          // Aqui vamos mockar a decodificação
          setToken(storedToken);
          // TODO: Fetch user details from e-Sigma or CoReVM backend
          setUsuario({
            id: "1",
            nome: "Usuário Logado",
            email: "teste@corevm.com",
            roles: storedToken.includes("super") ? ["superadmin"] : ["presidente_conselho"],
            conselho_id: "fake-uuid-conselho"
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
