import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Prevents "ReferenceError: process is not defined"
      'process.env': {}, 
      // Replaces specific env var usage
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});