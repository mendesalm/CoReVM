/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sigma: {
          bg: '#070F1E',        /* Fundo principal da aplicação (Azul mais escuro) */
          surface: '#0A1428',   /* Fundo de cards padrão (Azul escuro) */
          elevated: '#0E1C36',  /* Fundo de cabeçalhos/modais (Azul médio) */
          border: '#1E325C',    /* Bordas de divisões */
          accent: '#facc15',    /* Dourado ação (Yellow-400) */
          muted: '#64748b'      /* Texto secundário (Slate-500) */
        }
      }
    },
  },
  plugins: [
    require('tailwindcss-animate')
  ],
}
