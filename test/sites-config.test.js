import { describe, it, expect } from 'vitest';
import {
    SITES,
    DEFAULT_SITE,
    themeVars,
    siteBackground,
    siteCopy,
    hexToRgb01,
    resolveSiteByHost,
} from '../src/shared/sites.js';

describe('Site config helpers', () => {
    it('maps theme fields to CSS variables and ignores unknown ones', () => {
        expect(themeVars({ ink: '#fff', fontBody: 'X', nope: 'y' })).toEqual({
            '--ink': '#fff',
            '--font-body': 'X',
        });
        expect(themeVars(null)).toEqual({});
        expect(themeVars(undefined)).toEqual({});
    });

    it('merges background overrides with the defaults', () => {
        const fallback = siteBackground(DEFAULT_SITE);
        expect(fallback.crystal.motion).toBe('diagonal');
        expect(Array.isArray(fallback.particles.colors)).toBe(true);

        // 不存在的站点也拿默认背景，不能抛
        expect(siteBackground('nope').particles.density).toBeGreaterThan(0);
    });

    it('converts hex colors to 0..1 rgb and falls back to white', () => {
        expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
        expect(hexToRgb01('00ff00')).toEqual([0, 1, 0]);
        expect(hexToRgb01('not-a-color')).toEqual([1, 1, 1]);
    });

    it('falls back to the default site copy when a site has none', () => {
        expect(siteCopy('shian').hero.title).toBe('诗岸');
        // 赤羽还没写 copy，应完整回落尘站
        expect(siteCopy('chiyu').hero.title).toBe(SITES[DEFAULT_SITE].copy.hero.title);
        expect(siteCopy('chiyu').nav.forum).toBe(SITES[DEFAULT_SITE].copy.nav.forum);
    });

    it('resolves <key>.localhost for local preview', () => {
        expect(resolveSiteByHost('shian.localhost:5173').key).toBe('shian');
        expect(resolveSiteByHost('nope.localhost:5173').key).toBe(DEFAULT_SITE);
        expect(resolveSiteByHost('shian.stardustinfinity.top').key).toBe('shian');
    });
});
