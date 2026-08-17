// 构建期脚本：拉取仓库贡献者，生成关于页署名用的 src/shared/contributors.json。
// 由 package.json 的 prebuild 钩子调用，也可手动 node tool/fetch_contributors.mjs 跑。
// 拉取失败不中断构建：沿用已有的生成文件，文件不存在时才写入兜底名单。
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = 'stardust-fans/star-dust-fans';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/shared/contributors.json');

// 键为 GitHub 登录名小写（登录名大小写不敏感），值为署名展示名；表里没有的直接用登录名。
const ALIASES = {
    wuyilingwei: '武乙凌薇',
    cooollawf: '八月p',
};

const FALLBACK = Object.entries(ALIASES).map(([login, name]) => ({ login, name }));

export function normalizeContributors(list) {
    return list
        .filter(u => u && typeof u.login === 'string' && u.type !== 'Bot' && !u.login.endsWith('[bot]'))
        .sort((a, b) => (b.contributions || 0) - (a.contributions || 0))
        .map(u => ({ login: u.login, name: ALIASES[u.login.toLowerCase()] || u.login }));
}

function write(contributors) {
    writeFileSync(OUTPUT, `${JSON.stringify(contributors, null, 2)}\n`);
}

async function main() {
    const headers = {
        // GitHub 不带 User-Agent 会直接 403
        'User-Agent': 'star-dust-fans',
        Accept: 'application/vnd.github+json',
    };
    // CI 里有 token 可提高限额，本机没有也能跑
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=100`, { headers });
        if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list)) throw new Error('GitHub 返回格式异常');

        const contributors = normalizeContributors(list);
        // 空名单会让关于页变成「由共同主导」，宁可当成失败走沿用旧文件那条路
        if (!contributors.length) throw new Error('贡献者列表为空');
        write(contributors);
        console.log(`贡献者名单已更新：${contributors.map(c => c.name).join('、')}`);
    } catch (error) {
        console.warn(`⚠️ 拉取贡献者失败（${error.message}）`);
        if (existsSync(OUTPUT)) {
            console.warn('沿用已有的 src/shared/contributors.json');
        } else {
            write(FALLBACK);
            console.warn('已写入兜底名单');
        }
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await main();
}
