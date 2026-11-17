import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Web deploy: base '/'
 * Electron production: base './' so file:// loads ./assets/* correctly
 */
export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');
  const isElectronBuild = mode === 'electron';

  return {
    base: isElectronBuild ? './' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: !isElectronBuild,
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
    define: {
      __APP_MODE__: JSON.stringify(mode),
    },
    envPrefix: 'VITE_',
  };
});
