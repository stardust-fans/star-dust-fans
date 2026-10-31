import { ref, computed } from 'vue';
import { API_BASE } from '../../shared/api.js';
import { adminHasPermission } from '../../shared/adminPermissions.js';

// 模块级单例状态：所有引入本组合式函数的组件共享同一份登录态与权限
const token = ref(localStorage.getItem('adminToken') || '');
// 当前管理员档案：{ id, username, role, permissions, isSuper, allAccess }
const admin = ref(null);
const profileLoaded = ref(false);

const isAuthenticated = computed(() => !!token.value);
const isSuperAdmin = computed(
    () => !!admin.value && (admin.value.role === 'super' || admin.value.permissions === null)
);

async function fetchMe() {
    if (!token.value) {
        admin.value = null;
        profileLoaded.value = true;
        return null;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/me`, {
            headers: { Authorization: `Bearer ${token.value}` },
        });
        if (res.status === 401) {
            logout();
            return null;
        }
        if (!res.ok) {
            admin.value = null;
            return null;
        }
        admin.value = await res.json();
        return admin.value;
    } catch {
        admin.value = null;
        return null;
    } finally {
        profileLoaded.value = true;
    }
}

async function login(username, password) {
    const res = await fetch(`${API_BASE}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
        token.value = data.token;
        localStorage.setItem('adminToken', data.token);
        admin.value = data.admin || null;
        profileLoaded.value = true;
        if (!admin.value) await fetchMe();
        return { ok: true };
    }
    return { ok: false, error: data.error || '用户名或密码错误' };
}

function logout() {
    token.value = '';
    admin.value = null;
    profileLoaded.value = true;
    localStorage.removeItem('adminToken');
}

// 是否拥有某个模块的权限（与服务端同一套规则）
function can(scope) {
    return adminHasPermission(admin.value, scope);
}

export function useAdminAuth() {
    return {
        token,
        admin,
        profileLoaded,
        isAuthenticated,
        isSuperAdmin,
        can,
        login,
        logout,
        fetchMe,
    };
}
