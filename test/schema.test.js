import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function columns(table) {
    const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((result.results || []).map(column => column.name));
}

async function indexes(table) {
    const result = await env.DB.prepare(`PRAGMA index_list(${table})`).all();
    return new Set((result.results || []).map(index => index.name));
}

describe('submission schema', () => {
    it('contains the columns used by submission APIs', async () => {
        for (const [table, expected] of Object.entries({
            fanart: ['images', 'user_id', 'flag_reason'],
            shop: ['images', 'user_id', 'ship_time', 'flag_reason'],
        })) {
            const actual = await columns(table);
            for (const column of expected) expect(actual.has(column)).toBe(true);
        }
    });

    it('indexes submission ownership and status', async () => {
        const fanartIndexes = await indexes('fanart');
        const shopIndexes = await indexes('shop');
        expect(fanartIndexes.has('idx_fanart_user_id')).toBe(true);
        expect(fanartIndexes.has('idx_fanart_status')).toBe(true);
        expect(shopIndexes.has('idx_shop_user_id')).toBe(true);
        expect(shopIndexes.has('idx_shop_status')).toBe(true);
    });
});
