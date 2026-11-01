import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            {
                plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
                test: {
                    name: 'worker',
                    include: ['test/**/*.test.js'],
                    exclude: ['test/song-list.test.js'],
                    setupFiles: ['./test/setup.js'],
                },
            },
            {
                test: {
                    name: 'songs-ui',
                    include: ['test/song-list.test.js'],
                    environment: 'node',
                },
            },
        ],
    },
});
