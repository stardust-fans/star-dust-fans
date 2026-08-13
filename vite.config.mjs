import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve } from 'node:path';

export default defineConfig({
    publicDir: 'static',
    plugins: [vue(), cloudflare()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                admin: resolve(import.meta.dirname, 'admin/index.html'),
            },
        },
    },
});
