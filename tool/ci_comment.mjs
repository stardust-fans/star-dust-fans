import { readFileSync } from 'node:fs';
import { performanceRegressions, queryPlanRegressions } from './workflow_performance.mjs';

function readJson(file) {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function conciseComment({ build, test, statements, report, checks, baseline, regressions, runUrl, preview, reviewerNote }) {
    const ok = build === 'success' && test === 'success' && statements === 'success';
    const status = value => value === 'success' ? '通过' : value === 'failure' ? '失败' : '未完成';
    const lines = ['<!-- stardust-ci -->', (ok ? '✅ 检查通过' : '❌ 检查未通过') + ' · 测试 ' + (report?.numPassedTests || 0) + '/' + (report?.numTotalTests || 0),
        '构建：' + status(build) + ' · 代码/SQL：' + status(statements),
        baseline ? (regressions.length ? '⚠️ 明显性能回退：' + regressions.length + ' 项' : '性能：未发现明显回退') : '性能：暂无已合并基线'];
    const failures = (report?.testResults || []).flatMap(suite => (suite.assertionResults || []).filter(item => item.status === 'failed').map(item => ({ message: item.fullName || item.title })));
    const findings = [...(checks?.findings || []), ...regressions, ...failures];
    if (findings.length) {
        lines.push('', '<details><summary>明确问题（' + findings.length + ' 项）</summary>', '');
        for (const item of findings.slice(0, 10)) {
            const location = item.file ? item.file + ':' + item.line + ' — ' : '';
            const timing = item.before !== undefined ? ' (' + Math.round(item.before) + ' → ' + Math.round(item.after) + ' ms)' : '';
            lines.push('- ' + (location + item.message + timing).replace(/[\r\n]+/g, ' '));
        }
        lines.push('', '</details>');
    }
    if (preview) lines.push('', '[预览](' + preview + ')');
    lines.push('', '[完整检查日志](' + runUrl + ')');
    if (reviewerNote) lines.push('', reviewerNote);
    return lines.join('\n');
}

async function baselineReport(github, context, core) {
    const branch = context.payload.repository.default_branch;
    try {
        const { data } = await github.rest.actions.listWorkflowRuns({ ...context.repo, workflow_id: 'deploy.yml', status: 'success', per_page: 20 });
        for (const run of data.workflow_runs) {
            if (run.id === context.runId) continue;
            let merged = run.head_branch === branch && ['push', 'workflow_dispatch'].includes(run.event);
            if (!merged && run.event === 'pull_request') {
                for (const reference of run.pull_requests || []) {
                    const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: reference.number });
                    if (pr.merged && pr.base.ref === branch && pr.head.sha === run.head_sha) { merged = true; break; }
                }
            }
            if (!merged) continue;
            const { data: artifacts } = await github.rest.actions.listWorkflowRunArtifacts({ ...context.repo, run_id: run.id });
            const artifact = artifacts.artifacts.find(item => item.name === 'check-results' && !item.expired);
            if (!artifact) continue;
            const download = await github.rest.actions.downloadArtifact({ ...context.repo, artifact_id: artifact.id, archive_format: 'zip' });
            const { unzipSync, strFromU8 } = await import('fflate');
            const files = unzipSync(new Uint8Array(download.data));
            if (!files['test-results.json'] || !files['workflow-checks.json']) continue;
            return { tests: JSON.parse(strFromU8(files['test-results.json'])), checks: JSON.parse(strFromU8(files['workflow-checks.json'])) };
        }
    } catch (error) { core.info('性能基线暂不可用：' + error.message); }
    return null;
}

export async function publishCiComment({ github, context, core }) {
    const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: context.issue.number, per_page: 100 });
    let reviewerNote = '';
    if (files.some(file => file.filename.startsWith('.github/') || (file.filename.startsWith('test/') && ['modified', 'removed', 'renamed', 'changed'].includes(file.status)))) {
        try {
            const contributors = await github.paginate(github.rest.repos.listContributors, { ...context.repo, per_page: 100 });
            const reviewers = contributors.filter(item => item.type !== 'Bot' && item.login !== context.payload.pull_request.user.login).map(item => item.login);
            if (reviewers.length) {
                await github.rest.pulls.requestReviewers({ ...context.repo, pull_number: context.issue.number, reviewers });
                reviewerNote = '⚠️ 敏感路径变更，已自动分配评审人。';
            }
        } catch (error) { core.info('评审请求未完成：' + error.message); }
    }
    const report = readJson('test-results.json');
    const checks = readJson('workflow-checks.json');
    const baseline = await baselineReport(github, context, core);
    const regressions = [...performanceRegressions(report, baseline?.tests), ...queryPlanRegressions(checks, baseline?.checks)];
    const preview = (process.env.PREVIEW_OUTPUT || '').match(/https:\/\/[a-zA-Z0-9.\-]+\.workers\.dev\S*/)?.[0];
    const body = conciseComment({ build: process.env.BUILD_OUTCOME, test: process.env.TEST_OUTCOME, statements: process.env.STATEMENTS_OUTCOME,
        report, checks, baseline, regressions, preview, reviewerNote,
        runUrl: context.serverUrl + '/' + context.repo.owner + '/' + context.repo.repo + '/actions/runs/' + context.runId });
    const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: context.issue.number, per_page: 100 });
    const existing = comments.filter(item => item.user.type === 'Bot' && item.body.includes('<!-- stardust-ci -->'));
    if (existing.length) {
        await github.rest.issues.updateComment({ ...context.repo, comment_id: existing[0].id, body });
        for (const item of existing.slice(1)) await github.rest.issues.deleteComment({ ...context.repo, comment_id: item.id });
    } else await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body });
}
