/// <reference types="@capacitor/keyboard" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bibleresearch.app',
  appName: 'Bible Research',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
