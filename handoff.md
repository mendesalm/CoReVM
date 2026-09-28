# Documento de Handoff - Ecossistema Sigma / Lojas / CoReVM / Harmonia (28/09/2026)

**Data de Atualização:** 28 de Setembro de 2026  
**Status da Sessão:** 🟢 PWA e Capacitor Android configurados em todos os 4 módulos; Modernização Mobile First completa nos Calendários do CoReVM e Lojas; Correção de sobreposição e Menu Hambúrguer na Landing Page do e-Sigma; Blindagem definitiva de links de módulos contra localhost em ambiente mobile e produção.

---

## 🎯 Contexto Consolidado da Sessão (28/09/2026)

### 1. Fase 1: PWA Completo em Todos os Módulos
- **Manifests e Ícones:** Configurados `manifest.json` com `display: standalone`, `theme_color: #070e1c` e ícones padronizados em `e-sigma`, `CoReVM`, `Lojas` e `Harmonia`.
- **Service Workers Resilientes (`sw.js`):** Implementados Service Workers com estratégias de cache estático seguro (`stale-while-revalidate`), ignorando chamadas de API e autenticação.
- **Hook de Instalação (`usePwaInstall`):** Captura do evento `beforeinstallprompt` com botões de instalação nos dashboards.

### 2. Fase 2: Plataformas Nativas Capacitor Android
- **Capacitor 8.5+ Configurado:** Projetos Android nativos criados e sincronizados para os 4 módulos:
  - `e-sigma`: `com.esigma.hub`
  - `CoReVM`: `com.esigma.corevm`
  - `Lojas`: `com.esigma.lojas`
  - `Harmonia`: `com.esigma.harmonia`
- **Estilização Nativa Deep Blue:** `styles.xml` configurado com `windowBackground` em `#070E1C` e `statusBarColor` sem piscar tela branca.
- **Scripts de Build e Sincronização:** Comandos `"cap:sync"` e `"cap:android"` adicionados aos `package.json`.

### 3. Blindagem Definitiva de Links de Módulos (Fim do Bug de Localhost)
- **Diagnóstico:** Em WebViews do Capacitor Android, `window.location.hostname` é avaliado como `'localhost'`. A lógica anterior acreditava que o usuário estava em desenvolvimento local e tentava abrir `http://localhost:5174` e `http://localhost:5175`.
- **Solução:** `configuracaoAmbiente.ts` e `DashboardCliente.tsx` do `e-sigma` agora apontam **categoricamente** para os domínios de produção na nuvem (`https://core.e-sigma.app`, `https://lojas.e-sigma.app`, `https://harmonia.e-sigma.app`). O uso de portas locais exige agora a flag explícita `VITE_USAR_SATELITES_LOCAIS=true`.
- **Cache Invalidação:** Versão do cache do PWA elevada para `v3` (`esigma-pwa-cache-v3`).

### 4. Modernização Mobile First dos Calendários (CoReVM & Lojas)
- **CoReVM (`PaginaCalendario.tsx`):**
  - Alternador [ 📋 Lista | 📅 Mês ] no topo. Telas móveis (< 768px) iniciam automaticamente no modo **Lista**.
  - Cards de eventos com badge de data destacada, tags coloridas por tipo maçônico e targets de toque ergonômicos (> 44px).
  - Exportação direta para **Google Agenda** e download de arquivo **Apple Calendar / iCal (.ics)**.
  - Floating Action Button (FAB) móvel dourado no canto inferior direito para criação de eventos.
- **Lojas (`LodgeSessionsWidget.tsx`, `PaginaInicio.tsx`, `PaginaSessoes.tsx`):
  - Alternador de visualização [ 📋 Lista | 📅 Mês ] no widget do painel principal.
  - Cards empilhados touch-native no mobile na `PaginaSessoes.tsx`, eliminando a rolagem horizontal de 700px da tabela.
  - Botões de exportação Google Agenda e iCal nas sessões e modal de detalhes do dia.
  - FAB móvel flutuante (`+ Nova Sessão`) no alcance do polegar.

### 5. Correção de Layout Mobile First na Landing Page (`e-sigma.app`)
- **Fim da Sobreposição no Cabeçalho:** Criado menu hambúrguer com **Gaveta Lateral (*Drawer*) em Glassmorphism**, recolhendo a navegação em telas `< 900px` e eliminando a colisão com o botão de login.
- **Botão "Entrar" Compacto:** Substituído o botão fixo de 170px por um botão responsivo touch-friendly com ícone de login.
- **Hero Responsivo:** Padding superior com respiro de segurança (`pt: { xs: '84px', sm: '96px', md: '108px' }`), logo escalável (`130px - 220px`) e viewport dinâmica `100dvh`.
- **Fim da Trava de Rolagem:** Desativado `scroll-snap: mandatory` em telas móveis (`scrollSnapType: { xs: 'none', md: 'y mandatory' }`) para rolagem contínua suave no celular.

---

## 🏛️ Definição de Arquitetura e Portas do Ecossistema
- **`e-Sigma` (IdP & SaaS Hub)**: Porta `:8000`, Frontend `:5173`, Banco `esigma`. Domínio: `https://e-sigma.app`.
- **`Lojas` (ERP das Oficinas)**: Porta `:8001`, Frontend `:5175`, Banco `lojas_db`. Domínio: `https://lojas.e-sigma.app`.
- **`CoReVM` (Conselho Regional)**: Porta `:8003`, Frontend `:5174`, Banco `core_db`. Domínio: `https://core.e-sigma.app`.
- **`Harmonia` (Música e Rituais)**: Porta `:8002`, Frontend `:5178`. Domínio: `https://harmonia.e-sigma.app`.

---

## 🚧 Status dos Repositórios no GitHub
- **`e-sigma`**: Commit `57aac42` (main) enviado ao GitHub.
- **`CoReVM`**: Commit `ddd8cdb` (main) enviado ao GitHub.
- **`Lojas`**: Commit `a5dfd2a` (main) enviado ao GitHub.
- **`Harmonia`**: Working tree limpo, sincronizado.

---

## 📋 Próximos Passos Sugeridos para a Próxima Sessão
1. **Deploy no Servidor VPS (`srv854308`)**:
   - Rodar `git pull && npm run build` em `/var/www/esigma/frontend`, `/var/www/corevm/frontend` e `/var/www/lojas/frontend` para refletir as melhorias em produção na VPS.
2. **Capacitor Mobile (Fase 3 do Plano Mobile First)**:
   - Gerar APKs de teste via Android Studio (`npx cap open android`).
   - Adicionar plugins do Capacitor (`@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/haptics`) para feedback tátil nativo nos botões.
3. **Módulo Lojas**: Prosseguir com o espelhamento estrito do layout visual do sistema legado Sigma no frontend do Lojas.
