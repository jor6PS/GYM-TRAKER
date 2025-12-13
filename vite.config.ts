import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Esto permite usar process.env.API_KEY en el código del cliente
      // sin que la aplicación rompa por no encontrar 'process'.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});