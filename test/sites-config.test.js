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
        // hero 背景插画也能按站覆盖（none 表示不画）
        expect(themeVars({ heroBg: 'none' })).toEqual({ '--hero-bg-image': 'none' });
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
        // 品牌小字按站覆盖
        expect(siteCopy('shian').mark).toBe('山山聚集地');
        expect(siteCopy(DEFAULT_SITE).mark).toBe('吸尘器聚集地');
        // 赤羽还没写 copy，应完整回落尘站
        expect(siteCopy('chiyu').hero.title).toBe(SITES[DEFAULT_SITE].copy.hero.title);
        expect(siteCopy('chiyu').nav.forum).toBe(SITES[DEFAULT_SITE].copy.nav.forum);
        expect(siteCopy('chiyu').mark).toBe(SITES[DEFAULT_SITE].copy.mark);
        // 日报名 / 站点全称也按站覆盖
        expect(siteCopy('shian').dailyTitle).toBe('山山日报');
        expect(siteCopy('shian').siteTitle).toBe('诗岸粉丝站');
        expect(siteCopy('chiyu').dailyTitle).toBe(SITES[DEFAULT_SITE].copy.dailyTitle);
    });

    it('resolves <key>.localhost for local preview', () => {
        expect(resolveSiteByHost('shian.localhost:5173').key).toBe('shian');
        expect(resolveSiteByHost('nope.localhost:5173').key).toBe(DEFAULT_SITE);
        expect(resolveSiteByHost('shian.stardustinfinity.top').key).toBe('shian');
    });
});
