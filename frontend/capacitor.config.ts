import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.esigma.corevm',
  appName: 'Core',
  webDir: 'dist',
  server: {
    url: 'https://core.e-sigma.app',
    cleartext: true
  }
};

export default config;
