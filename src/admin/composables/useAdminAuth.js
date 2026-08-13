import { ref, computed } from 'vue';
import { API_BASE } from '../../shared/api.js';

// 模块级单例状态：所有引入本组合式函数的组件共享同一份登录态
const token = ref(localStorage.getItem('adminToken') || '');
const isAuthenticated = computed(() => !!token.value);

async function login(password) {
    const res = await fetch(`${API_BASE}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
        token.value = data.token;
        localStorage.setItem('adminToken', data.token);
        return { ok: true };
    }
    return { ok: false, error: data.error || '密码错误' };
}

function logout() {
    token.value = '';
    localStorage.removeItem('adminToken');
}

export function useAdminAuth() {
    return { token, isAuthenticated, login, logout };
}
