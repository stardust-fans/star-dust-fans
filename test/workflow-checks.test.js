import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { inspectStatements } from '../tool/workflow_checks.mjs';
import { performanceRegressions, queryPlanRegressions } from '../tool/workflow_performance.mjs';
import { conciseComment, publishCiComment } from '../tool/ci_comment.mjs';

const report = (durations, status = 'passed') => ({ testResults: [{ name: '/checkout/test/sample.test.js', assertionResults: durations.map((duration, i) => ({ fullName: 'case ' + i, status, duration })) }] });

describe('concise workflow evidence', () => {
    it('ignores absent baselines, ordinary timing noise, and newly added tests', () => {
        expect(performanceRegressions(report([1000]), null)).toEqual([]);
        expect(performanceRegressions(report([45, 9000]), report([30]))).toEqual([]);
        expect(performanceRegressions(report([0, 40]), report([0, 30]))).toEqual([]);
    });

    it('reports only large comparable test timing regressions', () => {
        expect(performanceRegressions(report([500]), report([100]))).toEqual([{ type: 'test-performance', message: 'case 0', before: 100, after: 500 }]);
        expect(performanceRegressions(report([300, 300, 300, 300, 300]), report([100, 100, 100, 100, 100]))).toHaveLength(1);
        expect(performanceRegressions(report([500], 'failed'), report([100]))).toEqual([]);
    });

    it('validates SQL against the schema without executing mutations', () => {
        const db = new DatabaseSync(':memory:');
        try {
            db.exec("CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO songs VALUES (1, 'Song')");
            const checked = inspectStatements('env.DB.prepare("DELETE FROM songs WHERE id = ?"); env.DB.prepare("SELECT missing FROM songs")', 'worker.js', db);
            expect(checked.statements).toHaveLength(2);
            expect(checked.findings).toMatchObject([{ type: 'sql', file: 'worker.js', message: expect.stringContaining('missing') }]);
            expect(db.prepare('SELECT COUNT(*) AS n FROM songs').get().n).toBe(1);
        } finally { db.close(); }
    });

    it('reports invalid JavaScript but does not invent SQL for dynamic templates', () => {
        const db = new DatabaseSync(':memory:');
        try {
            expect(inspectStatements('const = ;', 'broken.js', db).findings[0].type).toBe('syntax');
            expect(inspectStatements('env.DB.prepare(' + String.fromCharCode(96) + 'SELECT * FROM ' + '$' + '{table}' + String.fromCharCode(96) + ')', 'dynamic.js', db).statements).toEqual([]);
        } finally { db.close(); }
    });

    it('reports a lost index search, without treating intentional scans as a regression', () => {
        const indexed = { statements: [{ file: 'worker.js', line: 4, sql: 'SELECT * FROM songs WHERE title = ?', plan: ['SEARCH songs USING INDEX titles (title=?)'] }] };
        const scan = { statements: [{ ...indexed.statements[0], plan: ['SCAN songs'] }] };
        expect(queryPlanRegressions(scan, indexed)).toMatchObject([{ type: 'sql-performance', file: 'worker.js', line: 4 }]);
        expect(queryPlanRegressions(scan, scan)).toEqual([]);
        expect(queryPlanRegressions(scan, null)).toEqual([]);
    });
});

describe('workflow comments', () => {
    it('keeps successful comments concise and includes no individual timing rows', () => {
        const body = conciseComment({ build: 'success', test: 'success', statements: 'success', report: { numPassedTests: 100, numTotalTests: 100 }, checks: { findings: [] }, baseline: {}, regressions: [], runUrl: 'https://example.test/check' });
        expect(body).toContain('测试 100/100');
        expect(body).toContain('未发现明显回退');
        expect(body).not.toContain('<details>');
        expect(body.split('\n').length).toBeLessThan(10);
    });

    it('expands only explicit findings and distinguishes a missing baseline', () => {
        const body = conciseComment({ build: 'success', test: 'success', statements: 'failure', report: {}, checks: { findings: [{ file: 'worker.js', line: 5, message: 'no such column' }] }, baseline: null, regressions: [], runUrl: 'https://example.test/check' });
        expect(body).toContain('暂无已合并基线');
        expect(body).toContain('worker.js:5');
        expect(body).toContain('no such column');
        expect(body).toContain('<details>');
    });
});

vi.mock('fflate', () => { throw new Error('dependency installation incomplete'); });
afterEach(() => vi.unstubAllEnvs());

it('still publishes a concise failure report when artifact decoding dependencies are unavailable', async () => {
    vi.stubEnv('BUILD_OUTCOME', 'skipped');
    vi.stubEnv('TEST_OUTCOME', 'skipped');
    vi.stubEnv('STATEMENTS_OUTCOME', 'skipped');
    const createComment = vi.fn();
    const github = { paginate: vi.fn(async () => []), rest: {
        pulls: { listFiles: vi.fn() },
        issues: { listComments: vi.fn(), createComment },
        actions: {
            listWorkflowRuns: vi.fn(async () => ({ data: { workflow_runs: [{ id: 1, head_branch: 'main', event: 'push' }] } })),
            listWorkflowRunArtifacts: vi.fn(async () => ({ data: { artifacts: [{ id: 1, name: 'check-results', expired: false }] } })),
            downloadArtifact: vi.fn(async () => ({ data: new ArrayBuffer(0) })),
        },
    } };
    await publishCiComment({ github, context: { repo: { owner: 'project', repo: 'site' }, runId: 2, issue: { number: 1 }, serverUrl: 'https://example.test', payload: { repository: { default_branch: 'main' } } }, core: { info: vi.fn() } });
    expect(createComment).toHaveBeenCalledOnce();
    expect(createComment.mock.calls[0][0].body).toContain('检查未通过');
    expect(createComment.mock.calls[0][0].body).toContain('暂无已合并基线');
});
