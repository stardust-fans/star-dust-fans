import { describe, it, expect } from 'vitest';
import { normalizeContributors, withAliased } from '../tool/fetch_contributors.mjs';
import generated from '../src/shared/contributors.json';

describe('normalizeContributors', () => {
    it('套用别名并按提交数降序', () => {
        expect(normalizeContributors([
            { login: 'CooolLawf', type: 'User', contributions: 14 },
            { login: 'wuyilingwei', type: 'User', contributions: 48 },
            { login: 'someoneelse', type: 'User', contributions: 3 },
        ])).toEqual([
            { login: 'wuyilingwei', name: '武乙凌薇' },
            { login: 'CooolLawf', name: '八月p' },
            { login: 'someoneelse', name: 'someoneelse' },
        ]);
    });

    it('过滤掉 bot', () => {
        const result = normalizeContributors([
            { login: 'wuyilingwei', type: 'User', contributions: 48 },
            { login: 'dependabot[bot]', type: 'Bot', contributions: 99 },
            { login: 'renovate[bot]', type: 'User', contributions: 88 },
        ]);
        expect(result.map(c => c.login)).toEqual(['wuyilingwei']);
    });
});

describe('withAliased', () => {
    it('补上贡献者接口里还没出现的别名成员', () => {
        const result = withAliased([{ login: 'wuyilingwei', name: '武乙凌薇' }]);
        expect(result.map(c => c.name)).toEqual(['武乙凌薇', '八月p', 'StarryMiko2233']);
    });

    it('已在名单里的不重复补，大小写不敏感', () => {
        const result = withAliased([
            { login: 'CooolLawf', name: '八月p' },
            { login: 'cjnsasdf', name: 'StarryMiko2233' },
            { login: 'wuyilingwei', name: '武乙凌薇' },
        ]);
        expect(result.map(c => c.login)).toEqual(['CooolLawf', 'cjnsasdf', 'wuyilingwei']);
    });
});

describe('生成文件', () => {
    it('已提交且每项都有署名', () => {
        expect(generated.length).toBeGreaterThan(0);
        expect(generated.every(c => c.login && c.name)).toBe(true);
    });
});
