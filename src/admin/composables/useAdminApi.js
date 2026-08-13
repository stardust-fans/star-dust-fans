import { API_BASE } from '../../shared/api.js';
import { useAdminAuth } from './useAdminAuth.js';

// /api/admin/* 请求封装：自动附加 Authorization，401 时自动登出
export function useAdminApi() {
    const { token, logout } = useAdminAuth();

    async function adminFetch(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        headers['Authorization'] = `Bearer ${token.value}`;
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

        if (res.status === 401) {
            logout();
            throw new Error('登录已过期，请重新登录');
        }

        if (!res.ok) {
            let message = '请求失败';
            try {
                const errData = await res.json();
                if (errData && errData.error) message = errData.error;
            } catch {
                // 响应体不是 JSON，使用默认错误信息
            }
            throw new Error(message);
        }

        if (res.status === 204) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    return { adminFetch };
}
