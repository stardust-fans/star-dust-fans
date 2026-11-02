import { ADMIN_PERMISSION_KEYS } from '../shared/adminPermissions.js';

function storeError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function readAdminStore(env) {
  let store;
  try { store = JSON.parse(env.ADMIN_ACCOUNTS); } catch { throw storeError(503, '管理员配置无效'); }
  const ids = new Set();
  const names = new Set();
  if (!store || !Number.isSafeInteger(store.nextId) || store.nextId < 1 || !Array.isArray(store.groups) || !Array.isArray(store.accounts)) {
    throw storeError(503, '管理员配置无效');
  }
  const groupIds = new Set();
  for (const group of store.groups) {
    if (!group || typeof group.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(group.id) || groupIds.has(group.id) ||
        typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.permissions) ||
        group.permissions.some(key => !ADMIN_PERMISSION_KEYS.includes(key)) || new Set(group.permissions).size !== group.permissions.length) {
      throw storeError(503, '管理员配置无效');
    }
    groupIds.add(group.id);
  }
  for (const account of store.accounts) {
    if (!account || !Number.isSafeInteger(account.id) || account.id < 1 || account.id >= store.nextId ||
        typeof account.username !== 'string' || !account.username.trim() ||
        typeof account.password_hash !== 'string' || !account.password_hash ||
        Object.hasOwn(account, 'role') || Object.hasOwn(account, 'permissions') ||
        !Array.isArray(account.groupIds) || account.groupIds.some(id => !groupIds.has(id)) ||
        new Set(account.groupIds).size !== account.groupIds.length ||
        typeof account.created_at !== 'string' || !account.created_at ||
        ids.has(account.id) || names.has(account.username)) {
      throw storeError(503, '管理员配置无效');
    }
    ids.add(account.id);
    names.add(account.username);
  }
  return store;
}

export async function writeAdminStore(env, store) {
  if (![env.CF_API_TOKEN, env.CF_ACCOUNT_ID, env.WORKER_NAME].every(value => typeof value === 'string' && value.trim())) {
    throw storeError(503, '管理员存储未配置');
  }
  const text = JSON.stringify(store);
  readAdminStore({ ADMIN_ACCOUNTS: text });
  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/workers/scripts/${encodeURIComponent(env.WORKER_NAME)}/secrets`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ADMIN_ACCOUNTS', type: 'secret_text', text }),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error();
  } catch {
    throw storeError(502, '管理员存储写入失败');
  }
}
