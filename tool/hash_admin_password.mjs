// 一次性本地脚本：为管理员账号生成 PBKDF2-HMAC-SHA256 密码哈希串，
// 用于手动 bootstrap（wrangler d1 execute 插入 admins 表）。
// 用法：node tool/hash_admin_password.mjs   （交互式从 stdin 读密码，不接受命令行参数，避免落进 shell history）
//
// 迭代次数必须与 worker.js 的 PBKDF2_ITERATIONS 保持一致（见 agents/decisions.md 的实测记录）。
const PBKDF2_ITERATIONS = 50_000;

const { subtle } = await import('node:crypto').then(m => m.webcrypto);

function readPasswordFromStdin() {
    return new Promise((resolve) => {
        process.stdout.write('输入密码（不会回显）: ');
        const stdin = process.stdin;

        if (!stdin.isTTY) {
            // 非交互场景（管道/重定向）：不做掩码，仅读取整行——用于脚本化测试，
            // 真实 bootstrap 操作应在真实终端里跑，走下面的掩码分支。
            let raw = '';
            stdin.setEncoding('utf8');
            stdin.on('data', (chunk) => { raw += chunk; });
            stdin.on('end', () => resolve(raw.replace(/\r?\n$/, '')));
            return;
        }

        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let input = '';
        const CTRL_C = String.fromCharCode(3);
        const BACKSPACE = String.fromCharCode(127);
        const onData = (char) => {
            if (char === '\r' || char === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.stdout.write('\n');
                resolve(input);
                return;
            }
            if (char === CTRL_C) {
                process.exit(1);
            }
            if (char === BACKSPACE || char === '\b') {
                input = input.slice(0, -1);
                return;
            }
            input += char;
        };
        stdin.on('data', onData);
    });
}

function encodeBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await subtle.importKey(
        'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const derivedBits = await subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256
    );
    return `pbkdf2-sha256$${iterations}$${encodeBase64(salt)}$${encodeBase64(new Uint8Array(derivedBits))}`;
}

const password = await readPasswordFromStdin();
if (!password) {
    console.error('密码不能为空');
    process.exit(1);
}
const hash = await hashPassword(password);
console.log('\n生成的哈希串（用于 admins.password_hash）：\n');
console.log(hash);
console.log('\n示例插入命令：');
console.log(`npx wrangler d1 execute stardust-db --remote --command "INSERT INTO admins (username, password_hash) VALUES ('admin', '${hash}')"`);
