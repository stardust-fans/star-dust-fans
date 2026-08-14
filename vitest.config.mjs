import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
                vars: { TOKEN_SECRET: 'test-secret-ci' },
            },
        }),
    ],
    test: {
        include: ['test/**/*.test.js'],
        setupFiles: ['./test/setup.js'],
    },
});
