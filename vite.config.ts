
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [
      react(),
      // Plugin personalizado para limpiar el manifest y copiar archivos de Cloudflare
      {
        name: 'clean-manifest-and-cloudflare-files',
        closeBundle() {
          const distPath = join(process.cwd(), 'dist');
          const publicPath = join(process.cwd(), 'public');
          const manifestPath = join(distPath, 'manifest.webmanifest');
          
          // Limpiar manifest
          try {
            const content = readFileSync(manifestPath, 'utf-8').trim();
            writeFileSync(manifestPath, content, 'utf-8');
          } catch (error) {
            // Ignorar si el archivo no existe
          }
          
          // Copiar archivos de configuración de Cloudflare (_headers, _redirects)
          try {
            const headersSource = join(publicPath, '_headers');
            const headersDest = join(distPath, '_headers');
            if (existsSync(headersSource)) {
              const headersContent = readFileSync(headersSource, 'utf-8');
              writeFileSync(headersDest, headersContent, 'utf-8');
            }
            
            const redirectsSource = join(publicPath, '_redirects');
            const redirectsDest = join(distPath, '_redirects');
            if (existsSync(redirectsSource)) {
              const redirectsContent = readFileSync(redirectsSource, 'utf-8');
              writeFileSync(redirectsDest, redirectsContent, 'utf-8');
            }
          } catch (error) {
            console.warn('Error copying Cloudflare config files:', error);
          }
        }
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        strategies: 'generateSW',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png'],
        // 1. MANIFEST.JSON CONFIGURATION
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
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        // 2. SERVICE WORKER CONFIGURATION (Network First Strategy)
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: null,
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
        },
        devOptions: {
          // Desactivar service worker en desarrollo para evitar conflictos con WebSocket HMR de Vite
          enabled: false,
          type: 'module'
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Separar librerías de node_modules en chunks dedicados
            if (id.includes('node_modules')) {
              // React y React DOM
              if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              // Google GenAI
              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }
              // Supabase
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              // Recharts (gráficos pesados - se carga lazy en PRModal)
              // Aunque se carga lazy, si se incluye en algún bundle, va al chunk de charts
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              // Date-fns
              if (id.includes('date-fns')) {
                return 'vendor-dates';
              }
              // Lucide icons
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              // Resto de node_modules
              return 'vendor';
            }
            
            // Separar modales pesados en chunks propios
            if (id.includes('components/PRModal')) {
              return 'modal-pr';
            }
            if (id.includes('components/ArenaModal')) {
              return 'modal-arena';
            }
            if (id.includes('components/MonthlySummaryModal')) {
              return 'modal-summary';
            }
            
            // Servicios relacionados con IA (carga condicional)
            if (id.includes('services/workoutProcessor') || id.includes('workoutProcessor/')) {
              return 'services-ai';
            }
          },
          // Optimizar nombres de chunks para mejor caché
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        }
      },
      // Aumentar límite de advertencia pero mantener optimización
      chunkSizeWarningLimit: 600,
      // Optimizar para producción
      minify: 'esbuild', // Más rápido que terser, produce bundles más pequeños
      sourcemap: false, // Desactivar sourcemaps en producción para reducir tamaño
      target: 'esnext',
      cssCodeSplit: true, // Separar CSS por chunk
      reportCompressedSize: true, // Mostrar tamaños comprimidos en build
    },
  };
});
