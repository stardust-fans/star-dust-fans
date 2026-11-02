import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { babelParse } from 'vue/compiler-sfc';

export function inspectStatements(source, file, database) {
    const findings = [];
    const statements = [];
    let ast;
    try { ast = babelParse(source, { sourceType: 'module' }); }
    catch (error) { return { statements, findings: [{ type: 'syntax', file, line: error.loc?.line, message: error.message }] }; }
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && node.callee?.property?.name === 'prepare') {
            const argument = node.arguments[0];
            const sql = argument?.type === 'StringLiteral' ? argument.value
                : argument?.type === 'TemplateLiteral' && argument.expressions.length === 0 ? argument.quasis[0].value.cooked : null;
            if (sql) {
                const item = { file, line: node.loc.start.line, sql: sql.trim(), plan: [] };
                try { item.plan = database.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(row => row.detail); }
                catch (error) { findings.push({ type: 'sql', file, line: item.line, message: error.message }); }
                statements.push(item);
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (['loc', 'start', 'end', 'tokens', 'comments'].includes(key)) continue;
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    }
    visit(ast);
    return { statements, findings };
}

export function inspectRepository(root) {
    const db = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
    const result = { statements: [], findings: [], checkedFiles: 0 };
    try {
        db.exec(readFileSync(join(root, 'tool/schema.sql'), 'utf8'));
        const files = ['worker.js'];
        function collect(folder) {
            for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
                const file = join(folder, entry.name);
                if (entry.isDirectory()) collect(file);
                else if (entry.name.endsWith('.js')) files.push(file);
            }
        }
        collect('src/worker');
        for (const file of files) {
            const checked = inspectStatements(readFileSync(join(root, file), 'utf8'), file.replaceAll('\\', '/'), db);
            result.statements.push(...checked.statements);
            result.findings.push(...checked.findings);
            result.checkedFiles++;
        }
        return result;
    } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const report = inspectRepository(process.cwd());
    writeFileSync('workflow-checks.json', JSON.stringify(report, null, 2) + '\n');
    console.log('Checked ' + report.checkedFiles + ' backend files and ' + report.statements.length + ' static SQL statements.');
    for (const item of report.findings) console.error(item.file + ':' + item.line + ': ' + item.message);
    process.exitCode = report.findings.length ? 1 : 0;
}
