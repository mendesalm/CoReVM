// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
// Resolução Dinâmica de URLs da API em Runtime para CoReVM

export function obterUrlCorevmApi(): string {
  // Em produção no domínio da web (core.e-sigma.app), a API é servida na mesma origem sob /api/v1
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return '/api/v1';
    }
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:8003/api/v1';
}

export function obterUrlEsigmaApi(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return 'https://e-sigma.app/api/v1';
    }
  }
  return import.meta.env.VITE_ESIGMA_API_URL || 'http://localhost:8000/api/v1';
}

export const API_URL = obterUrlCorevmApi();
export const ESIGMA_API_URL = obterUrlEsigmaApi();
