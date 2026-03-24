import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'FindYourSong',
  webDir: 'www',
  server: {
    url: 'http://192.168.100.126:8100', // seu IP externo do PC
    cleartext: true                  // permite HTTP sem HTTPS
  }

};

export default config;
