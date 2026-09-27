/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import { coachPlugin } from './server/coach';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OPENAI_');
  return {
    plugins: [react(), coachPlugin(env.OPENAI_API_KEY ?? '', env.OPENAI_MODEL || 'gpt-4.1-mini')],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    // Tauri expects a fixed port and should not clear the screen.
    clearScreen: false,
    server: {
      proxy: { '/api/plans': 'http://127.0.0.1:3001' },
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
    },
    build: { rollupOptions: { input: { main: path.resolve(__dirname, 'index.html'), plans: path.resolve(__dirname, 'plans.html') } } },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
    },
  };
});
