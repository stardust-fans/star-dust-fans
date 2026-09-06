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
    // ===== 新增：本地开发服务器代理 =====
    server: {
        proxy: {
            // 代理 ip9.com.cn 请求，绕过 CORS
            '/api/ip': {
                target: 'https://ip9.com.cn',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/ip/, '')
            }
        }
    }
});