// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Porta fixa (2026-09-16): evita a auto-incrementação do Vite (5174, 5175...)
    // quando a porta padrao 5173 ja esta ocupada pelo frontend do e-Sigma. Com
    // strictPort, se 5174 estiver ocupada o Vite falha alto em vez de subir
    // silenciosamente noutra porta e quebrar o CORS do e-Sigma/CoReVM.
    port: 5174,
    strictPort: true,
  },
})
