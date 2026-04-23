import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'ShomeDesk Business',
          short_name: 'ShomeDesk',
          description: 'A daily report submission and supplier control system for ShomeDesk Business.',
          theme_color: '#3b82f6',
          icons: [
            {
              src: 'https://photos.fife.usercontent.google.com/pw/AP1GczPHcb8cu3ei00vbUzX00twP8KISTtNJccZCPclDx1eB2H76j9OWNz0=w192-h192-s-no-gm?authuser=0',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'https://photos.fife.usercontent.google.com/pw/AP1GczPHcb8cu3ei00vbUzX00twP8KISTtNJccZCPclDx1eB2H76j9OWNz0=w512-h512-s-no-gm?authuser=0',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        devOptions: {
          enabled: true
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // Increase limit to 4MB for precaching
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
