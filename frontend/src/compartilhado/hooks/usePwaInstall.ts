// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState, useEffect } from 'react';

/**
 * Hook para controle e gatilho do prompt nativo de instalação PWA.
 * Suporta detecção de status standalone e evento beforeinstallprompt.
 */
export function usePwaInstall() {
  const [promptInstalacao, setPromptInstalacao] = useState<any>(null);
  const [estaInstalado, setEstaInstalado] = useState(false);

  useEffect(() => {
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (navigator as any).standalone === true;
      
    setEstaInstalado(isStandalone);

    const capturarPrompt = (e: Event) => {
      e.preventDefault();
      setPromptInstalacao(e);
    };

    window.addEventListener('beforeinstallprompt', capturarPrompt);

    window.addEventListener('appinstalled', () => {
      setEstaInstalado(true);
      setPromptInstalacao(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', capturarPrompt);
    };
  }, []);

  const dispararInstalacao = async () => {
    if (!promptInstalacao) return false;
    promptInstalacao.prompt();
    const { outcome } = await promptInstalacao.userChoice;
    if (outcome === 'accepted') {
      setEstaInstalado(true);
      setPromptInstalacao(null);
      return true;
    }
    return false;
  };

  return {
    podeInstalar: !!promptInstalacao && !estaInstalado,
    estaInstalado,
    dispararInstalacao,
  };
}
