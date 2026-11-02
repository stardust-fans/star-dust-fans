function testDurations(report) {
    const durations = new Map();
    for (const suite of report?.testResults || []) {
        const file = String(suite.name).replaceAll('\\', '/').split('/test/').at(-1);
        for (const test of suite.assertionResults || []) {
            if (test.status !== 'passed' || !Number.isFinite(test.duration)) continue;
            const name = test.fullName || [...test.ancestorTitles, test.title].join(' ');
            durations.set(file + '::' + name, { name, duration: test.duration });
        }
    }
    return durations;
}

export function performanceRegressions(current, baseline) {
    if (!baseline) return [];
    const previous = testDurations(baseline);
    const findings = [];
    let before = 0, after = 0, matched = 0;
    for (const [key, test] of testDurations(current)) {
        const old = previous.get(key);
        if (!old) continue;
        before += old.duration;
        after += test.duration;
        matched++;
        if (test.duration >= old.duration * 3 && test.duration - old.duration >= 250) {
            findings.push({ type: 'test-performance', message: test.name, before: old.duration, after: test.duration });
        }
    }
    if (!findings.length && matched && after >= before * 2 && after - before >= 1000) {
        findings.push({ type: 'test-performance', message: '共有测试执行总耗时', before, after });
    }
    return findings;
}

export function queryPlanRegressions(current, baseline) {
    const key = item => item.file + '::' + item.sql.replace(/\s+/g, ' ').trim();
    const previous = new Map((baseline?.statements || []).map(item => [key(item), item]));
    const findings = [];
    for (const item of current?.statements || []) {
        const old = previous.get(key(item));
        if (!old) continue;
        for (const step of old.plan) {
            const table = /^SEARCH (\S+) USING (?:COVERING )?INDEX\b/.exec(step)?.[1];
            if (table && item.plan.some(line => line === 'SCAN ' + table)) {
                findings.push({ type: 'sql-performance', file: item.file, line: item.line, message: '索引查询变为全表扫描：' + table });
            }
        }
    }
    return findings;
}
