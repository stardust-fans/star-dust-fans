export const API_BASE = '/api';

export async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });
    } catch (error) {
        console.error(`请求 ${endpoint} 失败:`, error);
        throw error;
    }

    // ===== 只在"真正异常"时跳 fallback =====

    // 401：已登录但 token 失效
    if (response.status === 401 && token) {
        redirectToFallback('session-expired');
    }

    // 403：已登录但无权限
    if (response.status === 403) {
        redirectToFallback('admin-only');
    }

    // 5xx：服务器炸了
    if (response.status >= 500) {
        redirectToFallback('server-error');
    }

    // ===== 下面保持原来的逻辑 =====
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) return null;
    return await response.json();
}

let isRedirecting = false;
function redirectToFallback(reason) {
    if (isRedirecting) return;
    if (window.location.pathname === '/fallback') return;
    isRedirecting = true;
    window.location.href = `/fallback?reason=${reason}`;
}