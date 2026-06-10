import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // CRÍTICO para Electron: usa caminhos relativos no build final
  // (o Electron carrega via file://, não http://)
  base: './',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Não externaliza nada — o renderer é um bundle puro
    rollupOptions: {
      external: [],
    },
  },

  server: {
    port: 5173,
    strictPort: true, // Falha se a porta já estiver em uso (evita conflito com Electron)
  },

  // Exclui módulos Node.js do bundle do renderer (eles ficam no main.js)
  optimizeDeps: {
    exclude: ['electron'],
  },
});
