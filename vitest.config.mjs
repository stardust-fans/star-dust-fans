import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

function vueForNodeRenderer() {
    const plugin = vue({ template: { transformAssetUrls: false } });
    const transform = plugin.transform.handler;
    plugin.transform.handler = function (code, id, options) {
        return transform.call(this, code, id, { ...options, ssr: false });
    };
    return plugin;
}

export default defineConfig({
    test: {
        projects: [
            {
                plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
                test: {
                    name: 'worker',
                    include: ['test/**/*.test.js'],
                    exclude: ['test/song-list.test.js', 'test/admin-ui.test.js', 'test/workflow-checks.test.js'],
                    setupFiles: ['./test/setup.js'],
                },
            },
            {
                plugins: [vueForNodeRenderer()],
                test: {
                    name: 'admin-ui',
                    include: ['test/admin-ui.test.js'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'songs-ui',
                    include: ['test/song-list.test.js', 'test/workflow-checks.test.js'],
                    environment: 'node',
                },
            },
        ],
    },
});
