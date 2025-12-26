
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [
      react(),
      // Plugin personalizado para limpiar el manifest después de generarlo
      {
        name: 'clean-manifest',
        closeBundle() {
          const manifestPath = join(process.cwd(), 'dist', 'manifest.webmanifest');
          try {
            const content = readFileSync(manifestPath, 'utf-8').trim();
            writeFileSync(manifestPath, content, 'utf-8');
          } catch (error) {
            // Ignorar si el archivo no existe
          }
        }
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png'],
        devOptions: {
          // Desactivar service worker en desarrollo para evitar conflictos con WebSocket HMR de Vite
          enabled: false,
          type: 'module'
        },
        // 1. MANIFEST.JSON CONFIGURATION
        // Usamos el manifest de public/manifest.webmanifest (formato correcto, sin líneas en blanco)
        manifest: {
          name: 'GymTracker AI',
          short_name: 'Gym.AI',
          description: 'Intelligent Workout Tracker powered by Gemini AI',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          id: '/',
          categories: ['health', 'fitness', 'lifestyle'],
          lang: 'es',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '144x144',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        // 2. SERVICE WORKER CONFIGURATION (Network First Strategy)
        workbox: {
          // Desactivar logging verbose de Workbox
          cleanupOutdatedCaches: true,
          // Ignorar peticiones de red en precache (evita mensajes de "Precaching did not find a match")
          navigateFallback: null,
          // Configurar estrategias de caché
          runtimeCaching: [
            {
              // Páginas HTML: NetworkFirst para evitar contenido obsoleto
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 // 1 day
                },
                networkTimeoutSeconds: 3, // Fallback to cache if network takes > 3s
              }
            },
            {
              // Supabase API: Siempre ir a la red (NetworkOnly) - NO cachear
              // Esto evita que Workbox intente cachear peticiones a la API y reduzca los mensajes de consola
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              // Google Fonts: Cachear con StaleWhileRevalidate
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            },
            {
              // Assets estáticos (CSS, JS, imágenes): Cachear
              urlPattern: ({ request }) => ['style', 'script', 'worker', 'image'].includes(request.destination),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'assets',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                }
              }
            }
          ]
        }
      })
    ],
    define: {
      // Prevents "ReferenceError: process is not defined"
      'process.env': {}, 
      // Replaces specific env var usage
      // ROBUSTNESS: Check both API_KEY and VITE_API_KEY to prevent user error
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY),
    },
  };
});
