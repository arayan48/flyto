import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { execSync } from 'node:child_process';

let commit = '';
try {
  commit = '#' + execSync('git rev-parse HEAD').toString().slice(0, 10);
} catch (e) {
}

export default defineConfig({
  plugins: [
    vue(),
    Icons({ compiler: 'vue3' }),
  ],
  define: {
    FLYTO_VERSION: JSON.stringify(process.env.FLYTO_VERSION || commit || 'dev'),
  },
  // the pages are rendered by the server, Vite only builds the scripts they load
  base: './',
  build: {
    outDir: '../public/app',
    emptyOutDir: false,
    manifest: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        upload: 'src/upload.js',
        download: 'src/download.js',
        admin: 'src/admin.js',
        account: 'src/account.js',
      },
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
