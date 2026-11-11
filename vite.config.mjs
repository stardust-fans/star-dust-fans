import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve } from 'node:path';

export default defineConfig({
    publicDir: 'static',
    plugins: [vue(), cloudflare()],
    environments: {
        client: {
            build: {
                rollupOptions: {
                    input: {
                        main: resolve(import.meta.dirname, 'index.html'),
                        admin: resolve(import.meta.dirname, 'admin/index.html'),
                    },
                },
            },
        },
    },
    // ===== 只保留这个 =====
    optimizeDeps: {
        include: ['oh-my-live2d'],
    },
    server: {
        // 本地预览子站：shian.localhost:5173 / chiyu.localhost:5173 …
        // Vite 默认会拦非 localhost 的 Host，这里显式放行 *.localhost
        allowedHosts: ['.localhost'],
        proxy: {
            '/api/ip': {
                target: 'https://ip9.com.cn',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/ip/, '')
            }
        }
    }
});