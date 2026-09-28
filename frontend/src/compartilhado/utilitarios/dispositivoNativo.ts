import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

export const isDispositivoNativo = Capacitor.isNativePlatform();

/**
 * Inicializa os recursos nativos do sistema operacional quando a aplicação monta.
 */
export async function inicializarDispositivoNativo() {
  if (!isDispositivoNativo) return;

  try {
    // 1. Configuração da Barra de Status (Deep Blue Dark #070E1C com ícones claros)
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#070E1C' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }

    // 2. Comportamento do Teclado Virtual (redimensionamento inteligente)
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

    // 3. Ocultar suavemente a Splash Screen nativa após a aplicação carregar
    await SplashScreen.hide({ fadeOutDuration: 400 });
  } catch (erro) {
    console.debug('Aviso na inicialização de recursos nativos:', erro);
  }
}

/**
 * Configura o listener do botão físico de voltar do Android (Hardware Back Button).
 */
export function configurarBotaoVoltarNativo(onVoltar?: () => boolean | void) {
  if (!isDispositivoNativo) return () => {};

  const listenerPromise = App.addListener('backButton', ({ canGoBack }) => {
    if (onVoltar) {
      const consumido = onVoltar();
      if (consumido) return;
    }

    if (canGoBack) {
      window.history.back();
    } else {
      App.minimizeApp();
    }
  });

  return () => {
    listenerPromise.then(l => l.remove()).catch(() => {});
  };
}

/**
 * Utilitários de Haptics (Feedback Tátil Taptic Engine / Vibração)
 */
export const feedbackTatil = {
  // Toque suave em botões ou abas
  clique: async () => {
    if (!isDispositivoNativo) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (_) {}
  },
  // Toque médio em botões primários / FAB
  acaoMedia: async () => {
    if (!isDispositivoNativo) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (_) {}
  },
  // Confirmação de sucesso (Salvar, Presença registrada, Voto confirmado)
  sucesso: async () => {
    if (!isDispositivoNativo) return;
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (_) {}
  },
  // Alerta de aviso
  aviso: async () => {
    if (!isDispositivoNativo) return;
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch (_) {}
  },
  // Erro em validação ou operação cancelada
  erro: async () => {
    if (!isDispositivoNativo) return;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch (_) {}
  }
};
