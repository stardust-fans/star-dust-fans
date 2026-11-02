import { ADMIN_GROUP_PRESETS } from '../src/shared/adminGroupPresets.js';

const PBKDF2_ITERATIONS = 50_000;

const { subtle } = await import('node:crypto').then(m => m.webcrypto);

function readPasswordFromStdin() {
    return new Promise((resolve) => {
        process.stderr.write('输入密码（不会回显）: ');
        const stdin = process.stdin;

        if (!stdin.isTTY) {
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
                process.stderr.write('\n');
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
if (password.length < 8) {
    console.error('密码至少 8 位');
    process.exit(1);
}
const hash = await hashPassword(password);
const username = (process.argv[2] || 'admin').trim();
if (!username || process.argv.length > 3) {
    console.error('用法：node tool/hash_admin_password.mjs [用户名]');
    process.exit(1);
}
console.log(JSON.stringify({
    nextId: 2,
    groups: ADMIN_GROUP_PRESETS.map(({ id, name, permissions }) => ({ id, name, permissions: [...permissions] })),
    accounts: [{
        id: 1, username, password_hash: hash, groupIds: ['owners'],
        created_at: new Date().toISOString(),
    }],
}));
